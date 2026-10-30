/* ARQUIVO: src/index.jsx */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { iniciarPwa } from './pwa';
import './theme.css';
import './polish.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

iniciarPwa();
