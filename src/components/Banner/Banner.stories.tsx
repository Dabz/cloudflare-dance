import Banner from './Banner';

export default {
  title: 'Banner',
  component: Banner,
};

export const Default = {
  args: {
    label: 'Room',
    message: 'Someone changed the TV display',
    countdownSeconds: 30,
    onDismiss: () => {},
  },
};
