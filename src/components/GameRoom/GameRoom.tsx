import { useEffect, useRef, useState, type FC, type FormEvent } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import { MainScene } from "../../scenes/main";
import type { CharacterName } from "../../scenes/player";
import {useParams} from "react-router";
import {getPlayerIdentity, getPlayerInformationInRoom} from "../../security/auth";
import type {Player} from "../../../worker/model/player";
import Const from "../../../worker/const"
import {useNavigate} from 'react-router';
import { getDisplayNameCookie, UNKNOWN_DISPLAY_NAME } from "../../security/displayName";
import type {StreamVideo} from "../../../worker/model/streams";
import {listStreams} from "../../streams";
import type { ChatRequest, FixPopMinigameState, MinigameAnswerRequest, MinigameControlRequest, MinigameHitRequest, PlayerDanceRequest, PlaygroundInteractRequest, PlayerUpdateRequest, RoomDisplayUrlRequest, WSServerMessage } from "../../../worker/model/gameroom";
import type {Chat} from "../../../worker/model/chat";
import LoadingOverlay from "../LoadingOverlay/LoadingOverlay";
import MobileJoystick from "../MobileJoystick/MobileJoystick";
import RoomBanners from "../RoomBanners/RoomBanners";
import RoomControls from "../RoomControls/RoomControls";
import HowToPlayPanel from "../HowToPlayPanel/HowToPlayPanel";
import RoomMenuModal from "../RoomMenuModal/RoomMenuModal";
import FixPopTriviaModal from "../FixPopTriviaModal/FixPopTriviaModal";
import CharacterPickerModal from "../CharacterPickerModal/CharacterPickerModal";
import ChatPanel from "../ChatPanel/ChatPanel";
import TvDisplayModal from "../TvDisplayModal/TvDisplayModal";

function getDisplayNameForJoin(displayName: string): string {
  if (displayName !== UNKNOWN_DISPLAY_NAME) return displayName;
  return getDisplayNameCookie() ?? displayName;
}

function isSmallTouchDevice(): boolean {
  if (typeof window === "undefined") return false;

  return window.matchMedia("(pointer: coarse), (max-width: 640px)").matches;
}

const GameRoom: FC = () => {
  const reactCanvas = useRef<HTMLCanvasElement | null>(null);
  const mainSceneRef = useRef<MainScene | undefined>(undefined);
  const wsRef = useRef<WebSocket | undefined>(undefined);
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

  function moveJoystick(x: number, z: number) {
    mainSceneRef.current?.setMainPlayerMoveInput(x, z);
  }

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
    <MobileJoystick onMove={moveJoystick} />
    {sceneLoading && <LoadingOverlay progress={sceneLoadingProgress} />}
    <RoomBanners
    minigameNotice={minigameNotice}
    roomAnnouncement={roomAnnouncement}
    roomAnnouncementSeconds={roomAnnouncementSeconds}
    onDismissMinigame={() => setMinigameNotice("")}
    onDismissAnnouncement={() => { setRoomAnnouncement(""); setRoomAnnouncementSeconds(0); }}
    />
    <RoomControls onDance={dance} onOpenCharacter={() => setCharacterPopupOpen(true)} onOpenMenu={() => setMenuPopupOpen(true)} />
    <HowToPlayPanel open={howToPlayOpen} onToggle={() => setHowToPlayOpen((open) => !open)} />
    {menuPopupOpen && (
      <RoomMenuModal
      minigameEnabled={minigameEnabled}
      onClose={() => setMenuPopupOpen(false)}
      onReset={() => { mainSceneRef.current?.resetMainPlayerPosition(); setMenuPopupOpen(false); }}
      onMainMenu={() => navigate('/')}
      onStartDdos={startDdosNow}
      onStartFixPop={startFixPopNow}
      onToggleDdos={setDdosEnabled}
      />
    )}
    {fixPopPopupOpen && fixPopState?.active && (
      <FixPopTriviaModal
      fixPopState={fixPopState}
      answers={fixPopAnswers}
      onAnswer={(questionId, answerIndex) => setFixPopAnswers((current) => ({ ...current, [questionId]: answerIndex }))}
      onSubmit={submitFixPopAnswers}
      onClose={() => setFixPopPopupOpen(false)}
      />
    )}
    {characterPopupOpen && (
      <CharacterPickerModal selectedCharacter={selectedCharacter} onSelect={changeCharacter} onClose={() => setCharacterPopupOpen(false)} />
    )}
    <ChatPanel open={chatOpen} chats={chats} draftMessage={draftChatMessage} onToggle={() => setChatOpen((open) => !open)} onDraftChange={setDraftChatMessage} onSend={sendChatMessage} />
    {tvPopupOpen && (
      <TvDisplayModal draftDisplayUrl={draftDisplayUrl} streams={streams} onClose={() => setTvPopupOpen(false)} onSubmit={saveDisplayUrl} onDraftChange={setDraftDisplayUrl} onShareVideo={(url) => { setDraftDisplayUrl(url); shareDisplayUrl(url); }} />
    )}
    </>
  );
};

export default GameRoom;
