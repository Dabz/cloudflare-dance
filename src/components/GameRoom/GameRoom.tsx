import { useEffect, useRef, useState, type FC, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import { MainScene } from "../../scenes/main";
import { CHARACTER_NAMES, type CharacterName } from "../../scenes/player";
import {useParams} from "react-router";
import {getPlayerIdentity, getPlayerInformationInRoom} from "../../security/auth";
import type {Player} from "../../../worker/model/player";
import Const from "../../../worker/const"
import {useNavigate} from 'react-router';
import { getDisplayNameCookie, UNKNOWN_DISPLAY_NAME } from "../../security/displayName";
import type {StreamVideo} from "../../../worker/model/streams";
import {listStreams} from "../../streams";
import { CLOUDFLARE_TRIVIA_QUESTIONS, type ChatRequest, type FixPopMinigameState, type MinigameAnswerRequest, type MinigameControlRequest, type MinigameHitRequest, type PlayerDanceRequest, type PlaygroundInteractRequest, type PlayerUpdateRequest, type RoomDisplayUrlRequest, type WSServerMessage } from "../../../worker/model/gameroom";
import type {Chat} from "../../../worker/model/chat";

function getDisplayNameForJoin(displayName: string): string {
  if (displayName !== UNKNOWN_DISPLAY_NAME) return displayName;
  return getDisplayNameCookie() ?? displayName;
}

function getStreamTitle(stream: StreamVideo, index: number): string {
  return stream.meta?.name || stream.meta?.filename || `Video ${index + 1}`;
}

function parseChatContent(content: string): { content: string; playerNameColor?: string } {
  const match = content.match(/^\[name:(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\]\s*/);
  if (!match) return { content };

  return {
    content: content.slice(match[0].length),
    playerNameColor: match[1],
  };
}

function getPlayerNameColor(playerName: string): string {
  let hash = 0;
  for (let index = 0; index < playerName.length; index++) {
    hash = (hash * 31 + playerName.charCodeAt(index)) % 360;
  }

  return `hsl(${hash} 92% 68%)`;
}

function parseInternalPlayerMessage(content: string): { before: string; playerName: string; after: string } | undefined {
  const match = content.match(/^Player (.+) (join|left) the room$/);
  if (!match) return undefined;

  return {
    before: "Player ",
    playerName: match[1],
    after: ` ${match[2]} the room`,
  };
}

function isSmallTouchDevice(): boolean {
  if (typeof window === "undefined") return false;

  return window.matchMedia("(pointer: coarse), (max-width: 640px)").matches;
}

const GameRoom: FC = () => {
  const reactCanvas = useRef<HTMLCanvasElement | null>(null);
  const mainSceneRef = useRef<MainScene | undefined>(undefined);
  const wsRef = useRef<WebSocket | undefined>(undefined);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | undefined>(undefined);
  const [draftDisplayUrl, setDraftDisplayUrl] = useState("");
  const [draftChatMessage, setDraftChatMessage] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatOpen, setChatOpen] = useState(() => !isSmallTouchDevice());
  const [streams, setStreams] = useState<StreamVideo[] | undefined>(undefined);
  const [tvPopupOpen, setTvPopupOpen] = useState(false);
  const [characterPopupOpen, setCharacterPopupOpen] = useState(false);
  const [menuPopupOpen, setMenuPopupOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(() => !isSmallTouchDevice());
  const [sceneLoading, setSceneLoading] = useState(true);
  const [sceneLoadingProgress, setSceneLoadingProgress] = useState(0);
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 });
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterName>("characterY");
  const [minigameEnabled, setMinigameEnabled] = useState(true);
  const [minigameNotice, setMinigameNotice] = useState("");
  const [roomAnnouncement, setRoomAnnouncement] = useState("");
  const [roomAnnouncementSeconds, setRoomAnnouncementSeconds] = useState(0);
  const [roomAnnouncementVersion, setRoomAnnouncementVersion] = useState(0);
  const [fixPopState, setFixPopState] = useState<FixPopMinigameState | undefined>(undefined);
  const [fixPopPopupOpen, setFixPopPopupOpen] = useState(false);
  const [fixPopAnswers, setFixPopAnswers] = useState<Record<string, number>>({});
  const { id: roomId } = useParams()
  const navigate = useNavigate()

  function shareDisplayUrl(url: string) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const payload: RoomDisplayUrlRequest = {
      type: "display-url",
      url,
    };
    wsRef.current.send(JSON.stringify(payload));
    setTvPopupOpen(false);
  }

  function dance() {
    mainSceneRef.current?.danceMainPlayer();
  }

  function changeCharacter(character: CharacterName) {
    setSelectedCharacter(character);
    mainSceneRef.current?.setMainPlayerCharacter(character);
    setCharacterPopupOpen(false);
  }

  function getCharacterLabel(character: CharacterName) {
    return character === "characterY" ? "Character Y" : character[0].toUpperCase() + character.slice(1);
  }

  function setDdosEnabled(enabled: boolean) {
    setMinigameEnabled(enabled);
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const request: MinigameControlRequest = { type: "minigame-control", enabled };
    wsRef.current.send(JSON.stringify(request));
  }

  function startDdosNow() {
    setMinigameEnabled(true);
    setMenuPopupOpen(false);
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const request: MinigameControlRequest = { type: "minigame-control", enabled: true, startNow: true, name: "ddos" };
    wsRef.current.send(JSON.stringify(request));
  }

  function startFixPopNow() {
    setMenuPopupOpen(false);
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const request: MinigameControlRequest = { type: "minigame-control", enabled: true, startNow: true, name: "fix-pop" };
    wsRef.current.send(JSON.stringify(request));
  }

  function getFixPopQuestions(state?: FixPopMinigameState) {
    if (!state) return [];
    return state.questionIds
      .map((questionId) => CLOUDFLARE_TRIVIA_QUESTIONS.find((question) => question.id === questionId))
      .filter((question) => Boolean(question));
  }

  function submitFixPopAnswers() {
    if (!fixPopState?.active || wsRef.current?.readyState !== WebSocket.OPEN) return;

    const request: MinigameAnswerRequest = { type: "minigame-answer", name: "fix-pop", answers: fixPopAnswers };
    wsRef.current.send(JSON.stringify(request));
    setFixPopPopupOpen(false);
  }

  function saveDisplayUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    shareDisplayUrl(draftDisplayUrl);
  }

  function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draftChatMessage.trim();
    if (!content || wsRef.current?.readyState !== WebSocket.OPEN) return;

    const payload: ChatRequest = {
      type: "chat",
      id: crypto.randomUUID(),
      content,
    };
    wsRef.current.send(JSON.stringify(payload));
    setDraftChatMessage("");
    setChatOpen(true);
  }

  function updateJoystick(clientX: number, clientY: number) {
    const joystick = joystickRef.current;
    if (!joystick) return;

    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxTravel = Math.max(1, Math.min(rect.width, rect.height) / 2 - 28);
    const rawX = clientX - centerX;
    const rawY = clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxTravel ? maxTravel / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const inputX = Math.abs(x / maxTravel) > 0.12 ? x / maxTravel : 0;
    const inputZ = Math.abs(y / maxTravel) > 0.12 ? -y / maxTravel : 0;

    setJoystickOffset({ x, y });
    mainSceneRef.current?.setMainPlayerMoveInput(inputX, inputZ);
  }

  function releaseJoystick() {
    joystickPointerIdRef.current = undefined;
    setJoystickOffset({ x: 0, y: 0 });
    mainSceneRef.current?.setMainPlayerMoveInput(0, 0);
  }

  function handleJoystickPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    joystickPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event.clientX, event.clientY);
  }

  function handleJoystickPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (joystickPointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    updateJoystick(event.clientX, event.clientY);
  }

  function handleJoystickPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (joystickPointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    releaseJoystick();
  }

  useEffect(() => {
    if (!chatOpen) return;

    chatListRef.current?.scrollTo({
      top: chatListRef.current.scrollHeight,
    });
  }, [chats, chatOpen]);

  useEffect(() => {
    if (!roomAnnouncement) return;

    setRoomAnnouncementSeconds(30);
    const interval = setInterval(() => {
      setRoomAnnouncementSeconds((seconds) => {
        if (seconds <= 1) {
          setRoomAnnouncement("");
          return 0;
        }

        return seconds - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [roomAnnouncement, roomAnnouncementVersion]);

  useEffect(() => {
    if (!roomId) return;

    let disposed = false;
    let mainScene: MainScene | undefined;
    let engine: BABYLON.Engine | undefined;
    let ws: WebSocket | undefined;
    let wsInterval: ReturnType<typeof setInterval> | undefined;

    listStreams().then((streams) => { 
      if (!disposed) setStreams(streams);
    });
    fetch(`/api/room/${encodeURIComponent(roomId)}/chats`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load chat history");
        return await res.json() as { chats: Chat[] };
      })
      .then(({ chats }) => {
        if (!disposed) setChats(chats);
      })
      .catch((error) => {
        console.error("Failed to load chat history", error);
      });

    const resizeListener = function () {
      mainScene?.resize();
    };

    function connectWebSocket(roomId: string, displayNameOverride: string, reconnection: boolean) {
      const wsUrl = `/ws/room/${roomId}${displayNameOverride ? `?reconnect=${encodeURIComponent(reconnection)}&displayName=${encodeURIComponent(displayNameOverride)}` : ""}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => console.log('WebSocket connected');
      ws.onclose = (ev) => {
        console.log('WebSocket disconnected');
        if (!disposed && ev.reason === Const.WS_REASON_RECONNECT) {
          console.warn("Disconnecting as a connection with similar ID have been detected");
          navigate('/');
        }

        setTimeout(() => {
          connectWebSocket(roomId, displayNameOverride, true)
        }, 1000)
      };
      return ws;
    }


    async function joinGame() {
      try {
        const identity = await getPlayerIdentity();
        const displayName = getDisplayNameForJoin(identity.displayName);
        const displayNameOverride = identity.displayName === UNKNOWN_DISPLAY_NAME && displayName !== UNKNOWN_DISPLAY_NAME
          ? displayName
          : undefined;
          const mainPlayer = await getPlayerInformationInRoom(roomId, displayNameOverride);
          if (!mainPlayer || !mainPlayer.id) {
            console.error("Can't fetch identity information");
            return;
          }
          if (disposed) return;
          setSelectedCharacter((mainPlayer.character as CharacterName) ?? "characterY");

          const { current: canvas } = reactCanvas;
          if (!canvas) return;

          setSceneLoading(true);
          setSceneLoadingProgress(0);
          console.log("Initiating main scene")
          mainScene = new MainScene((event, payload) => {
            if (event === "tv-interact") {
              if (fixPopState?.active) {
                setFixPopPopupOpen(true);
                return;
              }
              setTvPopupOpen(true)
            }
            if (event === "tv-leave") {
              setTvPopupOpen(false);
            }
            if (event === "player-dance") {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                const payload: PlayerDanceRequest = { type: "dance" };
                wsRef.current.send(JSON.stringify(payload));
              }
            }
            if (event === "playground-interact" && payload?.actionId) {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                const request: PlaygroundInteractRequest = {
                  type: "playground",
                  actionId: payload.actionId,
                  objectId: payload.objectId,
                  objectState: payload.objectState,
                };
                wsRef.current.send(JSON.stringify(request));
              }
            }
            if (event === "minigame-hit" && payload?.botId) {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                const request: MinigameHitRequest = { type: "minigame-hit", name: "ddos", botId: payload.botId };
                wsRef.current.send(JSON.stringify(request));
              }
            }
          });
          mainSceneRef.current = mainScene;
          engine = new BABYLON.Engine(canvas, true);
          await mainScene.createScene(engine, mainPlayer, (progress) => {
            if (!disposed) setSceneLoadingProgress(Math.max(0, Math.min(100, progress)));
          });

          if (disposed) {
            mainScene.dispose();
            engine.dispose();
            return;
          }

          ws = connectWebSocket(roomId, displayNameOverride, false);

          wsInterval = setInterval(() => {
            if (!ws || ws.readyState !== ws.OPEN || !mainScene?.mainPlayer) {
              return
            }

            const player: Player = {
              id: mainPlayer.id,
              displayName: mainPlayer.displayName,
              character: mainScene.mainPlayer.characterName,
              x: mainScene.mainPlayer.characterPosition.x,
              y: mainScene.mainPlayer.characterPosition.y,
              z: mainScene.mainPlayer.characterPosition.z,
              rotationY: mainScene.mainPlayer.rotationY,
              lastSeenSync: new Date().getTime(),
            }
            const playerUpdateRequest: PlayerUpdateRequest = {
              player: player,
              type: "player"
            }
            ws.send(JSON.stringify(playerUpdateRequest))
          }, 100);

          engine.runRenderLoop(() => {
            if (!disposed) {
              mainScene?.render();
            }
          });
          requestAnimationFrame(() => {
            if (!disposed) setSceneLoading(false);
          });

          window.addEventListener("resize", resizeListener);

          ws.addEventListener("message", (event) => {
            if (disposed) return;

            const payload = JSON.parse(event.data) as WSServerMessage
            if ("type" in payload && payload.type === "dance") {
              mainScene.dancePlayer(payload.playerId);
              return;
            }

            if ("type" in payload && payload.type === "playground") {
              mainScene.interactWithPlayground(payload.actionId, payload.playerId, payload.objectId, payload.objectState);
              return;
            }

            if ("type" in payload && payload.type === "chat") {
              setChats((currentChats) => [...currentChats, payload.chat].slice(-50));
              return;
            }

            if ("type" in payload && payload.type === "room-announcement") {
              setRoomAnnouncement(payload.message);
              setRoomAnnouncementVersion((version) => version + 1);
              return;
            }

            if ("type" in payload && payload.type === "minigame") {
              if (payload.state.name === "ddos") {
                mainScene.applyMinigameState(payload.state);
                setMinigameEnabled(payload.state.enabled);
                if (payload.event === "started") setMinigameNotice("DDoS attack started. Defend the TV with cannon fire!");
                if (payload.event === "ended") setMinigameNotice(payload.state.winnerName ? `DDoS defended. Top defender: ${payload.state.winnerName}` : "DDoS defended.");
                if (payload.event === "state" && !payload.state.enabled) setMinigameNotice("DDoS minigame disabled for this room.");
              } else {
                mainScene.applyFixPopMinigameState(payload.state);
                setFixPopState(payload.state);
                if (payload.event === "started") setMinigameNotice("A POP needs repair. Interact with the TV to answer Cloudflare trivia!");
                if (payload.event === "ended") setMinigameNotice(payload.state.winnerName ? `POP fixed. Top engineer: ${payload.state.winnerName}` : "POP repair complete.");
              }
              return;
            }

            if ("type" in payload && payload.type === "room-state") {
              setDraftDisplayUrl(payload.displayUrl);
              mainScene.tv.setLaptopUrl(payload.displayUrl, payload.displaySnapshot, payload.displayLastUpdate);
              mainScene.applyPlaygroundObjectStates(payload.playgroundObjectStates);
              mainScene.applyMinigameState(payload.minigame);
              mainScene.applyFixPopMinigameState(payload.fixPopMinigame);
              setMinigameEnabled(payload.minigame.enabled);
              setFixPopState(payload.fixPopMinigame);
              return;
            }

            if (!mainScene?.mainPlayer) return;

            const otherPlayers = [] as Player[];
            const playerIds = Object.keys(payload.players);
            for (const playerId of playerIds) {
              if (playerId == mainPlayer.id) {
                continue;
              }
              otherPlayers.push(payload.players[playerId])
            }
            mainScene.updatePlayerPosition(otherPlayers);
          });
      } catch (error) {
        if (disposed) {
          return;
        }

        console.error("Failed to join game", error);
        setSceneLoading(false);
        ws?.close(1000, Const.WS_REASON_LEAVING)
        engine?.stopRenderLoop();
        mainScene?.dispose();
        engine?.dispose();
        return;
      }
    }

    void joinGame();

    return () => {
      disposed = true;

      console.log("Closing websocket")
      if (wsInterval) clearInterval(wsInterval);
      ws?.close(1000, Const.WS_REASON_LEAVING)
      wsRef.current = undefined;
      window.removeEventListener("resize", resizeListener);

      console.log("Destroying main scene")
      engine?.stopRenderLoop();
      mainScene?.dispose();
      mainSceneRef.current = undefined;
      engine?.dispose();
    }
  }, [roomId, navigate]);

  return (
    <>
    <canvas id={styles.renderCanvas} ref={reactCanvas}></canvas>
    <div className={styles.MobileJoystickShell} aria-label="Move character">
    <div
    ref={joystickRef}
    className={styles.MobileJoystick}
    onPointerCancel={handleJoystickPointerUp}
    onPointerDown={handleJoystickPointerDown}
    onPointerMove={handleJoystickPointerMove}
    onPointerUp={handleJoystickPointerUp}
    role="application"
    >
    <span
    className={styles.MobileJoystickThumb}
    style={{ transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)` }}
    />
    </div>
    </div>
    {sceneLoading && (
      <section className={styles.LoadingScreen} aria-label="Loading game scene" aria-live="polite">
      <div className={styles.LoadingCard}>
      <span className={styles.LoadingKicker}>Loading room</span>
      <strong>{sceneLoadingProgress}%</strong>
      <div className={styles.LoadingBar} aria-hidden="true">
      <span style={{ width: `${sceneLoadingProgress}%` }} />
      </div>
      <p>Stealing the spotlight, unpacking the playground...</p>
      </div>
      </section>
    )}
    {minigameNotice && (
      <section className={styles.MinigameNotice} aria-live="polite">
      <span>DDoS</span>
      <p>{minigameNotice}</p>
      <button type="button" onClick={() => setMinigameNotice("")}>Dismiss</button>
      </section>
    )}
    {roomAnnouncement && (
      <section className={`${styles.MinigameNotice} ${styles.RoomAnnouncement}`} aria-live="polite">
      <span>Room</span>
      <p>{roomAnnouncement}</p>
      <div className={styles.BannerCountdown}>
      <p><strong>{roomAnnouncementSeconds}s</strong></p>
      <button type="button" onClick={() => { setRoomAnnouncement(""); setRoomAnnouncementSeconds(0); }}>Dismiss</button>
      </div>
      </section>
    )}
    <section className={styles.ControlsPanel} aria-label="Room controls">
    <div className={styles.PrimaryControls}>
    <button type="button" onClick={dance}>Dance</button>
    <button type="button" className={styles.CharacterOpenButton} onClick={() => setCharacterPopupOpen(true)}>
    Character
    </button>
    <button
    type="button"
    className={styles.ControlsToggle}
    onClick={() => setMenuPopupOpen(true)}
    >
    Menu
    </button>
    </div>
    </section>
    <section className={styles.KeyboardHelp} aria-label="How to play">
    <button
    type="button"
    className={styles.KeyboardHelpToggle}
    aria-expanded={howToPlayOpen}
    onClick={() => setHowToPlayOpen((open) => !open)}
    >
    <span className={styles.PanelKicker}>How to play</span>
    <span>{howToPlayOpen ? "Hide" : "Show"}</span>
    </button>
    {howToPlayOpen && (
      <dl>
      <div>
      <dt><kbd>WASD</kbd> <span>or</span> <kbd>Arrows</kbd></dt>
      <dd>Move</dd>
      </div>
      <div>
      <dt><kbd>Space</kbd></dt>
      <dd>Jump</dd>
      </div>
      <div>
      <dt><kbd>E</kbd></dt>
      <dd>Use nearby toys</dd>
      </div>
      <div>
      <dt><kbd>Q</kbd></dt>
      <dd>Dance</dd>
      </div>
      <div>
      <dt><kbd>Mouse drag</kbd></dt>
      <dd>Look around</dd>
      </div>
      </dl>
    )}
    </section>
    {menuPopupOpen && (
      <div className={styles.TvPopupBackdrop} role="presentation" onMouseDown={() => setMenuPopupOpen(false)}>
      <section
      className={`${styles.TvDisplayPopup} ${styles.MenuDisplayPopup}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-display-title"
      onMouseDown={(event) => event.stopPropagation()}
      >
      <div className={styles.TvPopupHeader}>
      <span>Room Menu</span>
      <button type="button" aria-label="Close room menu" onClick={() => setMenuPopupOpen(false)}>Close</button>
      </div>
      <div className={styles.MenuPopupIntro}>
      <h2 id="menu-display-title">Room controls</h2>
      <p>Reset your position or leave this room.</p>
      </div>
      <div className={styles.MenuActions}>
      <button
      type="button"
      onClick={() => {
        mainSceneRef.current?.resetMainPlayerPosition();
        setMenuPopupOpen(false);
      }}
      >
      Reset position
      </button>
      <button type="button" onClick={() => navigate('/')}>
      Main Menu
      </button>
      </div>
      <button type="button" className={styles.StartMinigameButton} onClick={startDdosNow}>
      Start DDoS now
      </button>
      <button type="button" className={styles.StartMinigameButton} onClick={startFixPopNow}>
      Start Fix POP now
      </button>
      <label className={styles.MinigameToggle}>
      <input
      type="checkbox"
      checked={minigameEnabled}
      onChange={(event) => setDdosEnabled(event.target.checked)}
      />
      <span>DDoS minigame enabled</span>
      </label>
      </section>
      </div>
    )}
    {fixPopPopupOpen && fixPopState?.active && (
      <div className={styles.TvPopupBackdrop} role="presentation" onMouseDown={() => setFixPopPopupOpen(false)}>
      <section
      className={`${styles.TvDisplayPopup} ${styles.FixPopDisplayPopup}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fix-pop-title"
      onMouseDown={(event) => event.stopPropagation()}
      >
      <div className={styles.TvPopupHeader}>
      <span>Fix POP</span>
      <button type="button" aria-label="Close Fix POP minigame" onClick={() => setFixPopPopupOpen(false)}>Close</button>
      </div>
      <div className={styles.FixPopIntro}>
      <h2 id="fix-pop-title">Repair the POP</h2>
      <p>Answer five Cloudflare trivia questions. Each correct answer is worth 10 points.</p>
      </div>
      <div className={styles.FixPopQuestions}>
      {getFixPopQuestions(fixPopState).map((question, questionIndex) => question && (
        <fieldset key={question.id}>
        <legend>{questionIndex + 1}. {question.question}</legend>
        {question.answers.map((answer, answerIndex) => (
          <label key={answer}>
          <input
          type="radio"
          name={question.id}
          checked={fixPopAnswers[question.id] === answerIndex}
          onChange={() => setFixPopAnswers((current) => ({ ...current, [question.id]: answerIndex }))}
          />
          <span>{answer}</span>
          </label>
        ))}
        </fieldset>
      ))}
      </div>
      <button type="button" className={styles.FixPopSubmit} onClick={submitFixPopAnswers}>
      Submit repair
      </button>
      </section>
      </div>
    )}
    {characterPopupOpen && (
      <div className={styles.TvPopupBackdrop} role="presentation" onMouseDown={() => setCharacterPopupOpen(false)}>
      <section
      className={`${styles.TvDisplayPopup} ${styles.CharacterDisplayPopup}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-display-title"
      onMouseDown={(event) => event.stopPropagation()}
      >
      <div className={styles.TvPopupHeader}>
      <span>Character Select</span>
      <button type="button" aria-label="Close character selection" onClick={() => setCharacterPopupOpen(false)}>Close</button>
      </div>
      <div className={styles.CharacterPickerIntro}>
      <h2 id="character-display-title">Choose your dancer</h2>
      <p>Pick your character model</p>
      </div>
      <div className={styles.CharacterPickerGrid}>
      {CHARACTER_NAMES.map((character) => {
        const selected = selectedCharacter === character;
        return (
          <button
          key={character}
          type="button"
          className={selected ? styles.CharacterCardSelected : ""}
          aria-pressed={selected}
          onClick={() => changeCharacter(character)}
          >
          <span className={styles.CharacterCardAvatar}>{getCharacterLabel(character).slice(0, 1)}</span>
          <strong>{getCharacterLabel(character)}</strong>
          <span>{selected ? "Current model" : "Switch model"}</span>
          </button>
        );
      })}
      </div>
      </section>
      </div>
    )}
    <section className={`${styles.ChatPanel} ${chatOpen ? styles.ChatPanelOpen : ""}`} aria-label="Room chat">
    <button
    type="button"
    className={styles.ChatToggle}
    aria-expanded={chatOpen}
    onClick={() => setChatOpen((open) => !open)}
    >
    Chat
    </button>
    {chatOpen && (
      <div className={styles.ChatBody}>
      <div className={styles.ChatMessages} ref={chatListRef}>
      {chats.length === 0 && <p className={styles.ChatEmpty}>No messages</p>}
      {chats.map((chat) => {
        const parsedChat = parseChatContent(chat.content);
        const internalPlayerMessage = chat.isInternal ? parseInternalPlayerMessage(parsedChat.content) : undefined;
        return (
          <article className={`${styles.ChatMessage} ${chat.isInternal ? styles.ChatMessageInternal : ""}`} key={chat.id}>
          {!chat.isInternal && chat.playerDisplayName && (
            <span className={styles.ChatPlayerId} style={parsedChat.playerNameColor ? { color: parsedChat.playerNameColor } : undefined}>
            {chat.playerDisplayName}
            </span>
          )}
          <p>
          {internalPlayerMessage ? (
            <>
            {internalPlayerMessage.before}
            <span className={styles.ChatInternalPlayerName} style={{ color: getPlayerNameColor(internalPlayerMessage.playerName) }}>
            {internalPlayerMessage.playerName}
            </span>
            {internalPlayerMessage.after}
            </>
          ) : parsedChat.content}
          </p>
          </article>
        );
      })}
      </div>
      <form className={styles.ChatForm} onSubmit={sendChatMessage}>
      <input
      aria-label="Chat message"
      maxLength={500}
      onChange={(event) => setDraftChatMessage(event.target.value)}
      placeholder="Say something"
      type="text"
      value={draftChatMessage}
      />
      <button type="submit" disabled={!draftChatMessage.trim()}>Send</button>
      </form>
      </div>
    )}
    </section>
    {tvPopupOpen && (
      <div className={styles.TvPopupBackdrop} role="presentation" onMouseDown={() => setTvPopupOpen(false)}>
      <section
      className={styles.TvDisplayPopup}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tv-display-title"
      onMouseDown={(event) => event.stopPropagation()}
      >
      <div className={styles.TvPopupHeader}>
      <span>Room TV</span>
      <button type="button" aria-label="Close TV display controls" onClick={() => setTvPopupOpen(false)}>Close</button>
      </div>
      <form className={styles.TvUrlForm} onSubmit={saveDisplayUrl}>
      <h2 id="tv-display-title">Set the laptop display</h2>
      <p>Share a webpage or video on the TV for everyone in this room.</p>
        <label htmlFor="tv-display-url">Laptop URL</label>
      <div className={styles.TvUrlRow}>
      <input
      id="tv-display-url"
      type="text"
      placeholder="https://example.com"
      value={draftDisplayUrl}
      onChange={(event) => setDraftDisplayUrl(event.target.value)}
      />
      <button type="submit">Share</button>
      </div>
      </form>
      <div className={styles.TvVideoPicker}>
      <span className={styles.TvVideoPickerTitle}>Choose a video</span>
      {streams === undefined && <p>Loading videos...</p>}
      {streams?.length === 0 && <p>No videos are available.</p>}
      {streams?.map((stream, index) => (
        <button
        key={stream.id}
        type="button"
        disabled={!stream.readyToStream || !stream.hlsPlaybackUrl}
        onClick={() => {
          setDraftDisplayUrl(stream.hlsPlaybackUrl);
          shareDisplayUrl(stream.hlsPlaybackUrl);
        }}
        >
        {stream.thumbnail && <img alt="" src={stream.thumbnail} />}
        <span>{getStreamTitle(stream, index)}</span>
        </button>
      ))}
      </div>
      </section>
      </div>
    )}
    </>
  );
};

export default GameRoom;
