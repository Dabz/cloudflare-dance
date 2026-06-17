import type { FC } from "react";
import { CHARACTER_NAMES, type CharacterName } from "../../scenes/player";
import Modal from "../Modal/Modal";
import styles from "./CharacterPickerModal.module.css";

interface CharacterPickerModalProps {
  selectedCharacter: CharacterName;
  onSelect: (character: CharacterName) => void;
  onClose: () => void;
}

function getCharacterLabel(character: CharacterName) {
  return character === "characterY" ? "Character Y" : character[0].toUpperCase() + character.slice(1);
}

const CharacterPickerModal: FC<CharacterPickerModalProps> = ({ selectedCharacter, onSelect, onClose }) => (
  <Modal title="Character Select" titleId="character-display-title" closeLabel="Close character selection" className={styles.CharacterDisplayPopup} onClose={onClose}>
    <div className={styles.CharacterPickerIntro} data-testid="CharacterPickerModal">
      <h2 id="character-display-title">Choose your dancer</h2>
      <p>Pick your character model</p>
    </div>
    <div className={styles.CharacterPickerGrid}>
      {CHARACTER_NAMES.map((character) => {
        const selected = selectedCharacter === character;
        return (
          <button key={character} type="button" className={selected ? styles.CharacterCardSelected : ""} aria-pressed={selected} onClick={() => onSelect(character)}>
            <span className={styles.CharacterCardAvatar}>{getCharacterLabel(character).slice(0, 1)}</span>
            <strong>{getCharacterLabel(character)}</strong>
            <span>{selected ? "Current model" : "Switch model"}</span>
          </button>
        );
      })}
    </div>
  </Modal>
);

export default CharacterPickerModal;
