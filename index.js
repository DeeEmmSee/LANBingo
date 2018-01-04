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
var defaultRoom = "the room";
var players = [];
var game_state = 0;

// Socket setup
var io = socket(server);

io.on('connection', function(socket){
	// On connect
		
	// Events
	socket.on('chat', function(data) {
		/*if (data.handle) {
			db.logs.insert({username:data.handle, message:data.message});	
		}*/
		
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
		
		/*db.account.find({username: data.name}, function(err,res) {
			if (res[0]) {
				logger.info("Is user");
			}
		});*/
		
		players.push({ 
			name: data.name, 
			cards: []
		});
		
		socket.name = data.name;
		socket.joinDateTime = new Date();
		socket.room = defaultRoom;
		socket.join(defaultRoom);
					
		AddPlayerToRoom(socket);	
		
		// Welcome message
		socket.emit('connect_success', { name: socket.name });
		socket.emit('chat', { message: socket.name + " has joined " + socket.room });
		socket.broadcast.emit('chat', { message: socket.name + " has joined " + socket.room });
		socket.emit('update_users', { users: players.map(function(u) { return u.name; }) });
		socket.broadcast.emit('update_users', { users: players.map(function(u) { return u.name; }) });
		
		// Generate numbers
		var cards = GenerateNumbers(socket.name);
		socket.emit('get_numbers', { cards: cards });
		
		// If there's 2 or more players then start auto-process of calling numbers
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
						
			socket.broadcast.emit('chat', { message: socket.name + " has left " + socket.room }); // Everyone EXCEPT client
			socket.broadcast.emit('update_users', { users: players.map(function(u) { return u.name; }) });
		}		
	});
});

function GenerateNumbers(player) {
	logger.info("Generating numbers");
	
	var cards = [];
	var p = GetPlayerIndex(player);

	// Reset cards
	players[p].cards = [];
	
	for (var i = 0; i < 6; i++) {
		cards.push({ 
			index: i,
			numbers: [], 
			numbersCount: { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1, '8': 1 }, 
			rowCount: { '0': [], '1': [], '2': [] },
			isValid: function() {
				for (var i = 0; i < 9; i++) {
					if (this.numbersCount[i] > 3) {
						return false;
					}
				}
				
				return true;
			},
			isRowValid: function() {				
				for (var i = 0; i < this.numbers.length; i++) {
					if (!checkNumberRowAndModular(this.numbers[i], this.numbers)) {
						return false;
					}
				}
				return true;
			}
		});
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
			var modular = n % 100 / 10 | 0;
			if (n == 90) {
				modular = 8;
			}
			
			var number = { number: n, row: -1, called: false, isValid: true, modular: modular};
			//var number = { number: n, isValid: true, modular: modular};
			cards[c].numbers.push(number);
			numbers[m].splice(i, 1);
		}
	}
		
	var remainingCards = [];
	for (var i = 0; i < cards.length; i++) {
		remainingCards.push(i);
	}
	
	// Distribute remaining numbers
	for (var m = 0; m < 9; m++) {	
		var tmpCards = [];
		
		for (var i = 0; i < remainingCards.length; i++) {
			tmpCards.push(remainingCards[i]);
		}
					
		while (numbers[m].length > 0) {
			var n = numbers[m][0]; // get first number
			var c; 
			var isValid = true;
			
			// Get random card
			while (tmpCards.length > 0) {
				var tmpI = Math.floor(Math.random() * tmpCards.length); //Random card index
				c = tmpCards[tmpI];
				
				if (cards[c].numbers.length >= 15) {
					//logger.warn("Card already has 15 numbers");
					remainingCards.splice(remainingCards.indexOf(c), 1);
					tmpCards.splice(tmpCards.indexOf(c), 1);
					continue;
				}
				
				// This is handled in the validation below
				if (cards[c].numbersCount[m] >= 3) {
					logger.warn("Card " + c + " already has 3 in the " + m + "0's numbers");
					isValid = false;
				}
				
				break;
			}
			
			cards[c].numbersCount[m]++;
			
			var modular = n % 100 / 10 | 0;
			if (n == 90) {
				modular = 8;
			}
			
			var number = { number: n, row: -1, called: false, isValid: isValid, modular: modular };
			//var number = { number: n, isValid: isValid, modular: modular };
			cards[c].numbers.push(number);
						
			numbers[m].splice(0, 1);
		}
		
	}
	
	var numbersValidCount = 0;
	
	// Check numbers are valid
	while (!cardsAreValid(cards)) {
		numbersValidCount++;
		
		for (var i = 0; i < cards.length; i++) {
			if (!cards[i].isValid()) {
				for (var j = 0; j < cards[i].numbers.length; j++) {
					if (!cards[i].numbers[j].isValid) {
						var validCards = [];
						var tmpOldNumber = cards[i].numbers[j];
						
						// Build array of cards that don't contain the card with the invalid number
						for (var c = 0; c < cards.length; c++) {
							if (i != c) {
								validCards.push(cards[c].index);
							}
						}
											
						// Get different number
						while (validCards.length > 0) {
							var tmpCardIndex = Math.floor(Math.random() * validCards.length); //Random card index
							var cardIndex = validCards[tmpCardIndex];
							
							var availableNumberIndex = [];
							
							// 0 - 14
							for (var a = 0; a < 15; a++) {
								availableNumberIndex.push(a);
							}
							
							while (availableNumberIndex.length > 0) {
								var tmpNumIndex = Math.floor(Math.random() * availableNumberIndex.length); //Random number index
								var numberIndex = availableNumberIndex[tmpNumIndex];
															
								var tmpNewNumber = cards[cardIndex].numbers[numberIndex];
								
								//console.log("Card: " + cards[i].index + " Old: " + tmpOldNumber.number);
								//console.log("Card: " + cards[cardIndex].index + " New: " + tmpNewNumber.number);
									
								// Check for other numbers in the same 10's
								// If old card has 3 of same 10's as new number
								// If new card has 3 of same 10's as old number
								// If new card has 1 from 10's (as all cards need at least 1 10's)
								if (tmpOldNumber.modular == tmpNewNumber.modular || 
									cards[cardIndex].numbersCount[tmpOldNumber.modular] == 3 ||
									cards[i].numbersCount[tmpNewNumber.modular] == 3 ||
									cards[cardIndex].numbersCount[tmpNewNumber.modular] == 1) {
									availableNumberIndex.splice(tmpNumIndex, 1);
									continue;
								}
								else {
									// switch numbers
									cards[cardIndex].numbers[numberIndex] = tmpOldNumber;
									cards[i].numbers[j] = tmpNewNumber;
									
									cards[i].numbersCount[tmpOldNumber.modular]--;
									cards[i].numbersCount[tmpNewNumber.modular]++;
									
									cards[cardIndex].numbersCount[tmpNewNumber.modular]--;
									cards[cardIndex].numbersCount[tmpOldNumber.modular]++;
									
									validCards = [];
									break;
								}
							}
							
							if (validCards.length == 0) {
								break;
							}
							
							validCards.splice(tmpCardIndex, 1);
						}
					}
				}
			}
		}
	}
	
	console.log("Times looped for numbers: " + numbersValidCount);
	
	// Assign number positions
	for (var c = 0; c < cards.length; c++) {
		var validRows = [0, 1, 2];
		
		for (var n = 0; n < cards[c].numbers.length; n++) {
			while (cards[c].numbers[n].row == -1) {
				var rowIndex = Math.floor(Math.random() * validRows.length);
				var row = validRows[rowIndex];
				
				// And row doesn't contain number in same 10's
				if (cards[c].rowCount[row].length < 5) {
					cards[c].numbers[n].row = row;
					cards[c].rowCount[row].push(cards[c].numbers[n].modular);
				}
				else {
					validRows.splice(rowIndex, 1);
				}
			}			
		}
	}
		
	var rowValidCount = 0;
	
	// Check positions are valid
	while (!cardRowsAreValid(cards)) {
		rowValidCount++;
		
		for (var c = 0; c < cards.length; c++) {
			// if 2 numbers have the same row and modular, change one of them		
			for (var n = 0; n < cards[c].numbers.length; n++) {
				var comparisonNum = cards[c].numbers[n];
				//Loop through the other numbers 
				var dupes = cards[c].numbers.filter(function(n) { return n.row == comparisonNum.row && n.modular == comparisonNum.modular; });
				
				if (dupes.length > 1) {
					// Duplicate
					var remainingRows = cards[c].numbers.filter(function(n) { return n.row != comparisonNum.row && n.modular != comparisonNum.modular; });
					var newRowIndex = Math.floor(Math.random() * remainingRows.length);
					
					var newRow = cards[c].numbers[newRowIndex].row;
					
					console.log("Card: " + cards[c].index);
					console.log(comparisonNum);
					console.log(cards[c].numbers[newRowIndex]);
					
					cards[c].numbers[newRowIndex].row = comparisonNum.row;
					cards[c].numbers[n].row = newRow;
					
					
					console.log("New");
					console.log(cards[c].numbers[newRowIndex]);
					console.log(cards[c].numbers[n]);
				}
			}
		}
	}
	
	console.log("Times looped for rows: " + rowValidCount);
	
	//Re-order numbers so it looks correct
	
	
	// Set cards to player
	players[p].cards = cards;
		
	for (var t = 0; t < 6; t++) {
		console.log("Card " + t + ": (" + cards[t].numbers.length + ")");
		console.log(cards[t].numbers);
		console.log(cards[t].numbersCount);
	}
	
	if (cardsAreValid(players[p].cards)) {
		logger.info("All cards are valid!");
	}
	else {
		logger.error("CARDS ARE NOT VALID");
		console.log(players[p].cards);
	}
	
	
	return cards;
}

// Functions
function cardsAreValid(cards) {
	for (var i = 0; i < cards.length; i++) {
		if (!cards[i].isValid()) {
			return false;
		}
	}
	return true;
}

function cardRowsAreValid(cards) {
	for (var i = 0; i < cards.length; i++) {
		if (!cards[i].isRowValid()) {
			return false;
		}
	}
	return true;
}

function checkNumberRowAndModular(number, numbersArray) {
	for (var i = 0; i < numbersArray.length; i++) {		
		if (number.row == numbersArray[i].row && number.modular == numbersArray[i].modular) {
			console.log("FALSE");
			console.log("Old: " + number.number + " New: " + numbersArray[i].number);
			
			return false;
		}		
	}
	return true;
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