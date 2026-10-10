import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { playbackService } from './lib/trackPlayerService';

registerRootComponent(App);
TrackPlayer.registerPlaybackService(() => playbackService);
