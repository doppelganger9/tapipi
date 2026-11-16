// WebSocket connection with automatic reconnection.

export function createConnection({ onMessage, onStatus, onOpen }) {
  let socket = null;

  function open() {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    socket.addEventListener('open', () => {
      onStatus(true);
      onOpen();
    });
    socket.addEventListener('message', (event) => onMessage(JSON.parse(event.data)));
    socket.addEventListener('close', () => {
      onStatus(false);
      setTimeout(open, 1500);
    });
  }
  open();

  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
  };
}
