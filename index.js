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
		
		//logger.info(players);
		
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

	// Reset cards
	players[p].cards = [];
	
	for (var i = 0; i < 6; i++) {
		//players[p].cards.push([]);
		cards.push([]);
	}
	
	// Go through all numbers
	var numbers = { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7': [], '8': [] };
	
	for (var n = 1; n <= 90; n++) {	
		var m = n % 100 / 10 | 0;
		if (n == 90) {
			m = 8;
		}
		numbers[m].push(n);
	}
		
	// For each card add a number from each modular value (as each card needs at least 1)
	for (var c = 0; c < cards.length; c++) {
		for (var m = 0; m < 9; m++) {
			var i = Math.floor((Math.random() * numbers[m].length)); //Random number index
			var n = numbers[m][i];
						
			var number = { number: n, position: "", called: false };
			cards[c].push(number);
			numbers[m].splice(i, 1);
		}
	}
	
	console.log(numbers);
	
	var remainingCards = [0, 1, 2, 3, 4, 5];
		
	// Distribute remaining numbers
	for (var m = 0; m < 9; m++) {
		var numbersCount = { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 };
		var tmpCards = [];
		
		for (var i = 0; i < remainingCards.length; i++) {
			tmpCards.push(remainingCards[i]);
		}
					
		while (numbers[m].length > 0) {
			var n = numbers[m][0]; // get first number
			var c; 
						
			// Get random card
			while (tmpCards.length > 0) {
				var tmpI = Math.floor(Math.random() * tmpCards.length); //Random card index
				c = tmpCards[tmpI];
				
				if (cards[c].length >= 15) {
					logger.warn("Card already has 15 numbers");
					remainingCards.splice(remainingCards.indexOf(c), 1);
					tmpCards.splice(tmpCards.indexOf(c), 1);
					continue;
				}
				
				/*if (numbersCount[c] >= 3) {
					logger.warn("Card already has 3 in those '10s' numbers");
					//console.log("c: " + c);
					//console.log("Before: " + tmpCards);
					tmpCards.splice(tmpCards.indexOf(c), 1);
					//console.log("After: " + tmpCards);
					continue;
				}*/
				
				break;
			}
			
			if (tmpCards.length == 0) {
				console.log("MAJOR ERROR");
			}
			
			numbersCount[c]++;
			
			var number = { number: n, position: "", called: false };
			cards[c].push(number);
						
			numbers[m].splice(0, 1);
		}
	}
	
	players[p].cards = cards;
	
	for (var t = 0; t < 6; t++) {
		console.log("Card " + t + ": " + cards[t].length);
		console.log(cards[t]);
	}
	//console.log(cards);
	return cards;
}

// Functions
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