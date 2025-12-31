/**
 * Brain3D - WebSocket Client
 */

class Brain3DWebSocket {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.callbacks = {
            onConnect: [],
            onDisconnect: [],
            onMessage: [],
            onStatusUpdate: [],
            onMetricsUpdate: [],
            onTopologyChange: [],
            onRefresh: [],
        };
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log('Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.connected = true;
            this.reconnectAttempts = 0;
            this._trigger('onConnect');
            this._updateUI(true);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.connected = false;
            this._trigger('onDisconnect');
            this._updateUI(false);
            this._scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._handleMessage(data);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };
    }

    _handleMessage(data) {
        // Trigger generic message callback
        this._trigger('onMessage', data);

        // Route to specific handlers
        switch (data.type) {
            case 'init':
                this._trigger('onRefresh', data.data);
                break;

            case 'status_update':
                this._trigger('onStatusUpdate', data);
                break;

            case 'metrics_update':
                this._trigger('onMetricsUpdate', data);
                break;

            case 'topology_change':
                this._trigger('onTopologyChange', data);
                break;

            case 'refresh':
                this._trigger('onRefresh', data.data);
                break;

            case 'heartbeat':
                // Server heartbeat - just acknowledge
                break;

            case 'pong':
                // Response to our ping
                break;

            default:
                console.log('Unknown message type:', data.type);
        }
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= CONFIG.WS.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnecting in ${CONFIG.WS.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, CONFIG.WS.reconnectDelay);
    }

    _updateUI(connected) {
        const dot = document.getElementById('redis-status');
        const info = document.getElementById('connection-info');

        if (dot) {
            dot.classList.toggle('connected', connected);
            dot.classList.toggle('disconnected', !connected);
        }

        if (info) {
            info.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }

    _trigger(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }

    // Public API
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
        }
    }

    send(data) {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify(data));
        }
    }

    ping() {
        this.send({ type: 'ping' });
    }

    setFocus(viewMode, machineId = null, areaId = null) {
        this.send({
            type: 'set_focus',
            view_mode: viewMode,
            machine_id: machineId,
            area_id: areaId,
        });
    }

    requestRefresh() {
        this.send({ type: 'refresh' });
    }

    subscribe(events) {
        this.send({ type: 'subscribe', events });
    }

    unsubscribe(events) {
        this.send({ type: 'unsubscribe', events });
    }
}

// Global instance
const wsClient = new Brain3DWebSocket();
