const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const User = require('./models/User');
const userRoutes = require('./routes/userRoute');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

// Middleware setup
app.use(express.json());
app.use(express.static('public'));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Home',
        user: req.user || null
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        title: 'Login',
        error: null,
        user: null
    });
});

app.get('/signup', (req, res) => {
    res.render('signup', {
        title: 'Sign Up',
        error: null,
        user: null
    });
});

app.use('/api/users', userRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch((err) => console.log('MongoDB connection error:', err));

// Store active users
const activeUsers = new Map();

// Socket.io connection handling
io.on('connection', async (socket) => {
    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);

            if (user) {
                activeUsers.set(socket.id, {
                    userId: user._id,
                    socketId: socket.id,
                    isAvailable: true,
                    currentPartner: null
                });
            }
        } catch (error) {
            socket.emit('auth_error', 'Authentication failed');
        }
    });

    socket.on('ready', async () => {
        const currentUser = activeUsers.get(socket.id);
        if (!currentUser) return;

        const availableUsers = Array.from(activeUsers.values()).filter(u =>
            u.socketId !== socket.id &&
            u.isAvailable &&
            !u.currentPartner
        );

        if (availableUsers.length > 0) {
            const randomUser = availableUsers[Math.floor(Math.random() * availableUsers.length)];

            currentUser.isAvailable = false;
            currentUser.currentPartner = randomUser.socketId;
            randomUser.isAvailable = false;
            randomUser.currentPartner = socket.id;

            io.to(randomUser.socketId).emit('paired', socket.id);
            socket.emit('paired', randomUser.socketId);
        } else {
            currentUser.isAvailable = true;
            socket.emit('waiting');
        }
    });

    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.currentPartner) {
            const partner = activeUsers.get(user.currentPartner);
            if (partner) {
                partner.isAvailable = true;
                partner.currentPartner = null;
                io.to(partner.socketId).emit('partner-disconnected');
            }
        }
        activeUsers.delete(socket.id);
    });

    socket.on('offer', ({ offer, to }) => {
        io.to(to).emit('offer', { offer, from: socket.id });
    });

    socket.on('answer', ({ answer, to }) => {
        io.to(to).emit('answer', { answer, from: socket.id });
    });

    socket.on('ice-candidate', ({ candidate, to }) => {
        io.to(to).emit('ice-candidate', { candidate, from: socket.id });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Omegle clone running on port ${PORT}`);
});
