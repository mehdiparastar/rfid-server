import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({ transports: ['websocket'], path: '/esp' })
export class EspGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    handleConnection(client: WebSocket) {
        console.log('ESP connected');
    }

    handleDisconnect(client: WebSocket) {
        console.log('ESP disconnected');
    }

    @SubscribeMessage('esp-scan')
    handleScan(@MessageBody() payload: any) {
        console.log('From ESP:', payload);
    }

    sendToEsp(data: any) {
        this.server.clients.forEach(ws => ws.send(JSON.stringify(data)));
    }
}
