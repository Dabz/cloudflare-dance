import type { FC } from "react";
import { CLOUDFLARE_TRIVIA_QUESTIONS, type FixPopMinigameState } from "../../../worker/model/gameroom";
import Modal from "../Modal/Modal";
import styles from "./FixPopTriviaModal.module.css";

interface FixPopTriviaModalProps { fixPopState: FixPopMinigameState; answers: Record<string, number>; onAnswer: (questionId: string, answerIndex: number) => void; onSubmit: () => void; onClose: () => void; }

const FixPopTriviaModal: FC<FixPopTriviaModalProps> = ({ fixPopState, answers, onAnswer, onSubmit, onClose }) => (
  <Modal title="Fix POP" titleId="fix-pop-title" closeLabel="Close Fix POP minigame" className={styles.FixPopDisplayPopup} onClose={onClose}>
    <div className={styles.FixPopIntro} data-testid="FixPopTriviaModal"><h2 id="fix-pop-title">Repair the POP</h2><p>Answer five Cloudflare trivia questions. Each correct answer is worth 10 points.</p></div>
    <div className={styles.FixPopQuestions}>{fixPopState.questionIds.map((questionId, questionIndex) => { const question = CLOUDFLARE_TRIVIA_QUESTIONS.find((candidate) => candidate.id === questionId); if (!question) return null; return <fieldset key={question.id}><legend>{questionIndex + 1}. {question.question}</legend>{question.answers.map((answer, answerIndex) => <label key={answer}><input type="radio" name={question.id} checked={answers[question.id] === answerIndex} onChange={() => onAnswer(question.id, answerIndex)} /><span>{answer}</span></label>)}</fieldset>; })}</div>
    <button type="button" className={styles.FixPopSubmit} onClick={onSubmit}>Submit repair</button>
  </Modal>
);

export default FixPopTriviaModal;
