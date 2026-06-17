import Modal from './Modal';

export default {
  title: 'Modal',
  component: Modal,
};

export const Default = {
  args: {
    title: 'Room Menu',
    titleId: 'modal-story-title',
    closeLabel: 'Close modal',
    onClose: () => {},
    children: <div id="modal-story-title">Modal content</div>,
  },
};
