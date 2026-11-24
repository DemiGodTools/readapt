import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { handleNotificationNavigation } from './lib/notifications';

// Handle background notification click events for Notifee
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS && detail.notification) {
    handleNotificationNavigation(detail.notification.data);
  }
});

registerRootComponent(App);
