import { Client, IMessage } from '@stomp/stompjs';

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }
  return 'ws://localhost:8081/ws';
};

const WS_URL = getWsUrl();

export class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, any> = new Map();

  constructor(private token: string, private onConnectCallback: () => void) {
    this.connect();
  }

  private connect() {
    const headers: Record<string, string> = {};
    if (this.token && this.token !== 'authenticated_session') {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    this.client = new Client({
      brokerURL: WS_URL,
      connectHeaders: headers,
      debug: (str) => {
        console.log(str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.client.onConnect = () => {
      console.log('Connected to WebSocket STOMP broker natively');
      this.onConnectCallback();
    };

    this.client.onStompError = (frame) => {
      console.error('Broker reported error: ' + frame.headers['message']);
      console.error('Additional details: ' + frame.body);
    };

    this.client.activate();
  }

  public subscribe(destination: string, callback: (message: any) => void) {
    if (!this.client || !this.client.connected) {
      console.warn('Stomp client not connected yet. Retrying subscription...');
      setTimeout(() => this.subscribe(destination, callback), 1000);
      return;
    }

    if (this.subscriptions.has(destination)) {
      this.subscriptions.get(destination).unsubscribe();
    }

    const sub = this.client.subscribe(destination, (message: IMessage) => {
      try {
        const payload = JSON.parse(message.body);
        callback(payload);
      } catch (e) {
        callback(message.body);
      }
    });

    this.subscriptions.set(destination, sub);
  }

  public unsubscribe(destination: string) {
    if (this.subscriptions.has(destination)) {
      this.subscriptions.get(destination).unsubscribe();
      this.subscriptions.delete(destination);
    }
  }

  public sendMessage(destination: string, payload: any) {
    if (this.client && this.client.connected) {
      this.client.publish({
        destination,
        body: JSON.stringify(payload),
      });
    } else {
      console.error('Cannot send message. Client not connected.');
    }
  }

  public disconnect() {
    if (this.client) {
      this.subscriptions.forEach((sub) => sub.unsubscribe());
      this.subscriptions.clear();
      this.client.deactivate();
      console.log('Disconnected from WebSocket');
    }
  }
}
