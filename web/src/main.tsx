import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Mount to #wine-agent-root when embedded in WordPress, otherwise #root
const container = document.getElementById('wine-agent-root') ?? document.getElementById('root')!;
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
