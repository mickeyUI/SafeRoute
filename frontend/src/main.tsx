import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';
import SharedJourneyPage from './SharedJourneyPage';
import { getTrackTokenFromPath } from './services';

const trackToken = getTrackTokenFromPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {trackToken ? <SharedJourneyPage token={trackToken} /> : <App />}
  </React.StrictMode>,
);
