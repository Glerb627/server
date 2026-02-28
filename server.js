const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Game State
let players = {};
let mapCoins = [];
let extractionPortals = [];

// Generate initial map loot and portals
for(let i=0; i<50; i++) mapCoins.push({ id: i, x: Math.random() * 2000 - 1000, y: Math.random() * 500, value: 1 });
setInterval(() => {
    if(extractionPortals.length < 3) {
        extractionPortals.push({ id: Date.now(), x: Math.random() * 2000 - 1000, y: 500, activeTime: 30000 });
    }
}, 10000); // Spawn a portal every 10 seconds

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Player joins the wager match
    socket.on('join_multiplayer', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            x: 0, y: 0,
            skin: data.skin,
            wager: data.wager,
            coins: data.wager // Start match holding wagered amount
        };
        socket.emit('init_game', { players, mapCoins, extractionPortals });
        socket.broadcast.emit('player_joined', players[socket.id]);
    });

    // Sync Movement
    socket.on('move', (data) => {
        if(players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].isDashing = data.isDashing;
            socket.broadcast.emit('player_moved', players[socket.id]);
        }
    });

    // The Brutal Combat Math
    socket.on('combat_kill', (victimId) => {
        let killer = players[socket.id];
        let victim = players[victimId];
        
        if(killer && victim) {
            // Your logic: Killer Wager * Victim Wager
            let lootStolen = killer.wager * victim.wager; 
            killer.coins += lootStolen;
            
            // Drop some scrap coins for scavengers
            for(let i=0; i<3; i++) {
                mapCoins.push({ id: Date.now()+i, x: victim.x + (Math.random()*50-25), y: victim.y, value: 2 });
            }

            io.emit('player_killed', { killerId: socket.id, victimId: victimId, newCoins: killer.coins });
            io.emit('map_coins_update', mapCoins);
            delete players[victimId];
        }
    });

    // Collect Map Coins
    socket.on('collect_coin', (coinId) => {
        let coinIndex = mapCoins.findIndex(c => c.id === coinId);
        if(coinIndex !== -1 && players[socket.id]) {
            players[socket.id].coins += mapCoins[coinIndex].value;
            mapCoins.splice(coinIndex, 1);
            io.emit('map_coins_update', mapCoins);
            socket.emit('update_inventory', players[socket.id].coins);
        }
    });

    // Extracting safely
    socket.on('extract', (portalId) => {
        if(players[socket.id]) {
            let extractedCoins = players[socket.id].coins;
            socket.emit('extraction_success', extractedCoins);
            delete players[socket.id];
            socket.broadcast.emit('player_left', socket.id);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('player_left', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Sawblade Multiplayer Server running on port ${PORT}`);
});
