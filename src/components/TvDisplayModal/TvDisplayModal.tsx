import type { FC, FormEvent } from "react";
import type { StreamVideo } from "../../../worker/model/streams";
import Modal from "../Modal/Modal";
import styles from "./TvDisplayModal.module.css";

interface TvDisplayModalProps { draftDisplayUrl: string; streams?: StreamVideo[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDraftChange: (value: string) => void; onShareVideo: (url: string) => void; }

function getStreamTitle(stream: StreamVideo, index: number): string { return stream.meta?.name || stream.meta?.filename || `Video ${index + 1}`; }

const TvDisplayModal: FC<TvDisplayModalProps> = ({ draftDisplayUrl, streams, onClose, onSubmit, onDraftChange, onShareVideo }) => (
  <Modal title="Room TV" titleId="tv-display-title" closeLabel="Close TV display controls" onClose={onClose}>
    <form className={styles.TvUrlForm} data-testid="TvDisplayModal" onSubmit={onSubmit}>
      <h2 id="tv-display-title">Set the laptop display</h2><p>Share a webpage or video on the TV for everyone in this room.</p><label htmlFor="tv-display-url">Laptop URL</label>
      <div className={styles.TvUrlRow}><input id="tv-display-url" type="text" placeholder="https://example.com" value={draftDisplayUrl} onChange={(event) => onDraftChange(event.target.value)} /><button type="submit">Share</button></div>
    </form>
    <div className={styles.TvVideoPicker}><span className={styles.TvVideoPickerTitle}>Choose a video</span>{streams === undefined && <p>Loading videos...</p>}{streams?.length === 0 && <p>No videos are available.</p>}{streams?.map((stream, index) => (<button key={stream.id} type="button" disabled={!stream.readyToStream || !stream.hlsPlaybackUrl} onClick={() => onShareVideo(stream.hlsPlaybackUrl)}>{stream.thumbnail && <img alt="" src={stream.thumbnail} />}<span>{getStreamTitle(stream, index)}</span></button>))}</div>
  </Modal>
);

export default TvDisplayModal;
