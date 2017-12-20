var express = require('express');
var socket = require('socket.io');
var mongojs = require('mongojs');
var logger = require('winston');
var db = mongojs('localhost:27017/chat', ['account']);

//db.account.insert({username:"b",password:"test2"});
//db.account.insert({username:"b",password:"test2"}, function(err) { });

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

//App setup
var app = express();
var server = app.listen(4000, function() { 
	logger.info('Listening on port 4000'); 
});

//Static files
app.use(express.static('public'));

// Variables
var rooms = [];
var defaultRoom = "General";
var players = [];
var game_state = 0;

// Socket setup
var io = socket(server);

io.on('connection', function(socket){
	// On connect
		
	// Events
	socket.on('chat', function(data) {
		if (data.handle) {
			db.logs.insert({username:data.handle, message:data.message});	
		}
		
		io.in(socket.room).emit('chat', data);
	});
	
	socket.on('set_nickname', function(data) {
		if (GetPlayerIndex(data.name) != -1) {
			//User already exists
			socket.emit('error_msg', { error: data.name + " already exists. Please enter another name" });
			socket.disconnect();
			return;
		}
		
		logger.info("Connected: " + data.name + " (" + socket.id + ")");
		
		db.account.find({username: data.name}, function(err,res) {
			if (res[0]) {
				logger.info("Is user");
			}
		});
		
		players.push({ name: data.name, cards: [] });
		
		socket.name = data.name;
		socket.joinDateTime = new Date();
		socket.room = defaultRoom;
		socket.join(defaultRoom);
					
		AddPlayerToRoom(socket);	
		
		// Welcome message
		socket.emit('connect_success', { name: socket.name });
		socket.emit('chat', { message: socket.name + " has joined " + socket.room });
		
		logger.info(players);
		
		// Generate numbers
		var cards = GenerateNumbers(socket.name);
		
		// If there's 2 or more players then start auto-process of generating numbers
		if (players.length >= 2) {
			
		}
	});
	
	socket.on('generate_numbers', function(){
		var cards = GenerateNumbers(socket.name);
		
		socket.emit('get_numbers', { cards: cards });
	});
	
	socket.on('disconnect', function(){
		if (socket.room != null) {
			var endDateTime = new Date();
						
			if (socket.joinDateTime != null) {
				logger.info("Disconnected: " + socket.name + " (" + socket.id + ") " + "- Up-time: " + ((endDateTime.getTime() - socket.joinDateTime.getTime()) / 1000));
			}
						
			socket.leave(socket.room);
			var roomIndex = GetRoomIndex(socket.room)
			
			if (roomIndex > -1) {
				socket.room = "";
				RemovePlayerFromRoom(socket);
			}
			
			players.splice(GetPlayerIndex(socket.name), 1);
						
			socket.broadcast.emit('chat', { message: socket.name + " has left" }); // Everyone EXCEPT client
		}		
	});
});

function GenerateNumbers(player) {
	var cards = [];
	var p = GetPlayerIndex(player);
	var cardCounter = [];

	var tmpCounter = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };	
	
	// Reset cards
	players[p].cards = [];
	
	for (var i = 0; i < 6; i++) {
		players[p].cards.push([]);
		cards.push([]);
		cardCounter.push(tmpCounter);
	}
	
	//Go through all numbers

	var	availableCards = [0, 1, 2, 3, 4, 5];
	
	for (var n = 1; n <= 90; n++) {	
		var c;
		var modular = n % 100 / 10 | 0;
		if (n == 90) {
			modular = 8;
		}
				
		while (true) {
			logger.debug(availableCards);
						
			if (availableCards.length == 0) {
				c = -1;
				break;			
			}
			
			c = GetRandomCard(availableCards);
			
			logger.debug("Card: " + c);
			
			// Does card already contain 15 numbers?
			if (players[p].cards[c].length == 15) {
				// Select another card
				logger.warn("Over 15 numbers");
				availableCards.splice(availableCards.indexOf(c), 1);
				continue;
			}
			
			//Does card already contain 3 numbers in the same 10s?			
			/*if (cardCounter[c][modular] >= 3) {
				// Select another card
				console.log("More than 3 in number 'tens'");
				availableCards.splice(c, 1);
				continue;
			}*/
			
			break;
		}
						
		cardCounter[c][modular]++;
			
		if (c == -1) {
			logger.error("PROBLEM. NO AVAILABLE CARD FOR NUMBER: " + n);
		}
				
		// Number position
				
		var number = { number: n, position: "", called: false };
		
		
		// Add
		players[p].cards[c].push(number);
		cards[c].push(number);
	}
	
	logger.info(cards);
	return cards;
}

// Functions
function GetRandomCard(availableCards) {
	var i = Math.floor((Math.random() * availableCards.length)); //Random card index
	return availableCards[i];
}

function GetPlayerIndex(player_name) {
	for (var p = 0; p < players.length; p++) {
		if (players[p].name == player_name) {
			return p;
		}
	}
	
	return -1
}

function GetRoomIndex(room_name) {
	for (r = 0; r < rooms.length; r++) {
		if (rooms[r].name == room_name) {
			return r;
		}
	}
	
	return -1;
}

function RemovePlayerFromRoom(socket) {
	for (r = 0; r < rooms.length; r++) {
		var room_player_index = rooms[r].players.indexOf(socket.id);
		
		if (room_player_index > -1) {
			rooms[r].players.splice(room_player_index, 1);
		}
	}
}

function AddPlayerToRoom(socket) {
	for (r = 0; r < rooms.length; r++) {
		if (rooms[r].name == socket.room) {
			rooms[r].players.push(socket.id);
		}
	}
}