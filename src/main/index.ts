import { app } from 'electron';
import { createAppWindow } from './app';

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  createAppWindow();

  app.on('activate', () => {
    createAppWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
