import FixPopTriviaModal from './FixPopTriviaModal';

export default {
  title: 'FixPopTriviaModal',
  component: FixPopTriviaModal,
};

export const Default = { args: { fixPopState: { name: "fix-pop", enabled: true, active: true, questionIds: [], scores: {}, playerNames: {}, answeredPlayers: {} }, answers: {}, onAnswer: () => {}, onSubmit: () => {}, onClose: () => {} } };
