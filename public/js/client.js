const socket = io();
let peerConnection;
let dataChannel = null;
let currentPartner = null;
let localStream = null;
let isReadyToConnect = false;
const publicPaths = ['/login', '/signup'];

async function authenticate() {
    const token = localStorage.getItem('token');
    if (!token && !publicPaths.includes(window.location.pathname)) {
        window.location.href = '/login';
        return;
    }
    if (token) {
        socket.emit('authenticate', token);
    }
}

socket.on('auth_error', (error) => {
    console.error(error);
    localStorage.removeItem('token');
    if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = '/login';
    }
});

if (!publicPaths.includes(window.location.pathname)) {
    authenticate();
}

const configuration = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'}
    ]
};

async function startChat() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            throw new Error('No video input devices found');
        }

        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: videoDevices[0].deviceId,
                width: {ideal: 1280},
                height: {ideal: 720}
            },
            audio: true
        });

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            await new Promise((resolve) => {
                localVideo.onloadedmetadata = () => {
                    localVideo.play().then(resolve);
                };
            });
        }

        isReadyToConnect = true;
        socket.emit('ready');
        return localStream;
    } catch (error) {
        console.log('Detailed device error:', error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Please ensure your camera is not in use by another application';
        document.querySelector('.video-container').appendChild(errorMessage);
        return null;
    }
}

function createPeerConnection(stream) {
    if (peerConnection) {
        cleanupMediaStream();
    }

    peerConnection = new RTCPeerConnection(configuration);

    // Create data channel for the initiator
    if (!dataChannel) {
        dataChannel = peerConnection.createDataChannel('chat');
        setupDataChannel(dataChannel);
    }

    // Handle receiving data channel
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };

    // Add all tracks from local stream
    stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
    });

    // Enhanced remote video handling
    peerConnection.ontrack = event => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.play().catch(e => console.log('Remote video play:', e));
            }
        }
    };

    // Monitor remote stream status
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected') {
            console.log('Video connection established');
        }
    };
}

function handlePeerConnectionState() {
    if (!peerConnection) return;

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
            case 'connected':
                console.log('Peers connected successfully');
                break;
            case 'disconnected':
            case 'failed':
                cleanupMediaStream();
                socket.emit('ready');
                break;
        }
    };
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data channel opened');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        if (messageInput && sendButton) {
            messageInput.disabled = false;
            sendButton.disabled = false;
        }
    };

    channel.onclose = () => {
        console.log('Data channel closed');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        if (messageInput && sendButton) {
            messageInput.disabled = true;
            sendButton.disabled = true;
        }
    };

    channel.onmessage = (event) => {
        try {
            const messageObj = JSON.parse(event.data);
            addMessage(`Partner: ${messageObj.content}`);
        } catch (e) {
            addMessage(`Partner: ${event.data}`);
        }
    };
}

function cleanupMediaStream() {
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    isReadyToConnect = false;
}

socket.on('paired', async partnerId => {
    currentPartner = partnerId;
    if (!localStream) {
        const stream = await startChat();
        if (!stream) {
            socket.emit('leave-chat');
            return;
        }
    }

    try {
        createPeerConnection(localStream);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', {offer, to: partnerId});
    } catch (error) {
        console.log('Connection error:', error);
        cleanupMediaStream();
    }
});

socket.on('offer', async ({offer, from}) => {
    try {
        currentPartner = from;
        if (!localStream) {
            const stream = await startChat();
            if (!stream) return;
        }

        createPeerConnection(localStream);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', {answer, to: from});
    } catch (error) {
        console.log('Answer creation failed:', error);
    }
});

socket.on('answer', async ({answer}) => {
    try {
        if (peerConnection.signalingState === "have-local-offer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (error) {
        console.log('Set remote description failed:', error);
    }
});

socket.on('ice-candidate', async ({candidate}) => {
    try {
        if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.log('ICE candidate error:', error);
    }
});

socket.on('partner-disconnected', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
    currentPartner = null;
    cleanupMediaStream();
    addMessage('System: Partner disconnected');
});

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const skipButton = document.getElementById('skipButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const sendButton = document.getElementById('sendButton');
    const messageInput = document.getElementById('messageInput');

    // Initialize message input state
    if (messageInput && sendButton) {
        messageInput.disabled = false;
        sendButton.disabled = false;
    }

    if (startButton) {
        startButton.addEventListener('click', async () => {
            const stream = await startChat();
            if (stream) {
                startButton.disabled = true;
                skipButton.disabled = false;
                disconnectButton.disabled = false;
            }
        });
    }

    if (skipButton) {
        skipButton.disabled = true;
        skipButton.addEventListener('click', () => {
            cleanupMediaStream();
            socket.emit('leave-chat');
            socket.emit('ready');
            addMessage('System: Finding new partner...');
        });
    }

    if (disconnectButton) {
        disconnectButton.disabled = true;
        disconnectButton.addEventListener('click', () => {
            if (currentPartner) {
                socket.emit('leave-chat');
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) {
                    remoteVideo.srcObject = null;
                }
                cleanupMediaStream();
                addMessage('System: Chat ended');
                startButton.disabled = false;
                skipButton.disabled = true;
                disconnectButton.disabled = true;
            }
        });
    }

    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && messageInput.value.trim()) {
                sendMessage();
            }
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', () => {
            if (messageInput.value.trim()) {
                sendMessage();
            }
        });
    }
});

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (message && dataChannel && dataChannel.readyState === 'open') {
        const messageObj = {
            content: message,
            timestamp: Date.now()
        };

        dataChannel.send(JSON.stringify(messageObj));
        addMessage(`You: ${message}`);
        messageInput.value = '';
    } else {
        console.log('Data channel state:', dataChannel ? dataChannel.readyState : 'no channel');
    }
}

function addMessage(message) {
    const messagesDiv = document.getElementById('messages');
    if (messagesDiv) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';

        if (message.startsWith('You:')) {
            messageElement.classList.add('sent');
        } else if (message.startsWith('Partner:')) {
            messageElement.classList.add('received');
        } else {
            messageElement.classList.add('system');
        }

        messageElement.textContent = message;
        messagesDiv.appendChild(messageElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}
