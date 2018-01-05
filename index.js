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
			rowCount: { 
				'0': [],
				'1': [],
				'2': [],
			},
			isValid: function() {
				for (var i = 0; i < 9; i++) {
					if (this.numbersCount[i] > 3) {
						return false;
					}
				}
				
				return true;
			},
			rowsAreValid: function() {
				for (var i = 0; i < 3; i++) {
					if (this.rowCount[i].length > 5) { // || this.rowCount[i].length < 5) {
						return false;
					}
				}
				
				return true;
			},
			getNumbersByModular: function(modular) {
				var tmpArray = [];
				
				// Get list of modular values by count 
				for (var i = 0; i < this.numbers.length; i++) {
					if (this.numbers[i].modular == modular) {
						tmpArray.push(this.numbers[i]);
					}
				}
				
				return tmpArray;
			},
			getModularValues: function(modValue) {
				var tmpArray = [];
				
				// Get list of modular values by count 
				for (var i = 0; i < 9; i++) {
					if (this.numbersCount[i] == modValue) {
						tmpArray.push(i);
					}
				}
				
				return tmpArray;
			},
			sortNumbers: function() {
				this.numbers.sort(function(a,b) { return a.number - b.number; });
			}
			/*isRowValid: function() {				
				for (var i = 0; i < this.numbers.length; i++) {
					if (!checkNumberRowAndModular(this.numbers[i], this.numbers)) {
						return false;
					}
				}
				return true;
			}*/
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
	while (!CardsAreValid(cards)) {
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
	
	for (var c = 0; c < cards.length; c++) {
		if (cards[c].isValid()) {
			cards[c].sortNumbers();
		}
		else {
			// "Shouldn't" get here
			logger.error("Card " + c + " is invalid (Numbers)");
			
		}
	}
	
	console.log("Times looped for numbers: " + numbersValidCount);
	
	// Assign number positions
	for (var c = 0; c < cards.length; c++) {
		// Cards with 3 of a 10's must be in numerical order i.e. 80, 81, 82 should be in rows 1, 2, 3 respectively
		// Cards with 2 of a 10's must be in either row 1 & 2, 1 & 3, or 2 & 3
		// Cards with 1 of a 10's must fill the remaining rows
				
		for (var i = 3; i > 0; i--) {
			var modVals = cards[c].getModularValues(i);
			
			// Each modular value
			for (var j = 0; j < modVals.length; j++) {
				var modValsNumbers = cards[c].getNumbersByModular(modVals[j]);
				//console.log(modValsNumbers);
				
				// Each number for modVals
				for (var n = 0; n < modValsNumbers.length; n++) {
					var index = GetCardIndex(modValsNumbers[n].number, cards[c].numbers);
					
					// Determine row
					// Groups of 3
					if (i == 3) {
						// Go 0, 1, 2
						cards[c].numbers[index].row = n;
						cards[c].rowCount[n].push(cards[c].numbers[index]);
					}
					else {
						var newN;
						
						// Groups of 2
						if (i == 2) {
							// First number
							if (n == 0) {
								// Row will be 0 or 1
								// If previous row is 1 then new row will be 2
								// Else pick either row 1 or 2
								newN = GetRandomNumber(1);
								if (cards[c].rowCount[newN].length == 5) {
									if (newN == 0) {
										newN = 1;
									}
									else {
										newN = 0;
									}
								}
							}
							// Second number
							else {
								// First number will be either row 1 or 2
								newN = Math.floor((Math.random() * 2) + 1);
								
								// If row already contains 5 numbers use other row
								if (cards[c].rowCount[newN].length == 5) {
									if (newN == 0) {
										newN = 1;
									}
									else if (newN == 1) {
										newN = 0;
									}
									
								}
							}
							
							cards[c].numbers[index].row = newN;
							cards[c].rowCount[newN].push(cards[c].numbers[index]);
						}
						// Groups of 1
						/*else if (i == 1) {
							// Take whatever's left
							newN = GetRandomNumber(2); // Row 0, 1, 2
							if (cards[c].rowCount[newN].length == 5) {
								if (newN == 0) { // Row 0, either 1 or 2
									newN = Math.floor((Math.random() * 2) + 1);
									if (cards[c].rowCount[newN].length == 5) {
										if (newN == 1) {
											newN = 2;
										}
										else {
											newN = 1;
										}
									}
								}
								else if (newN == 1) { // Row 1, either 0 or 2
									newN = Math.floor((Math.random() * 2) + 1);
									if (cards[c].rowCount[newN].length == 5) {
										if (newN == 0) {
											newN = 2;
										}
										else {
											newN = 0;
										}
									}
								}
								else if (newN == 2) { // Row 2, either 0 or 1
									newN = GetRandomNumber(1);
									if (cards[c].rowCount[newN].length == 5) {
										if (newN == 0) {
											newN = 1;
										}
										else {
											newN = 0;
										}
									}
								}
							}
						}*/
						
						//cards[c].numbers[index].row = newN;
						//cards[c].rowCount[newN].push(cards[c].numbers[index]);
					}
				}
			}
		}
	}
	
	
	
	// Final row check
	/*for (var c = 0; c < cards.length; c++) {
		var rowTooMuch, rowTooLittle;
		var cardFixed = true;
		
		for (var r = 0; r < 3; r++) {
			if (cards[c].rowCount[r].length > 5) {
				console.log("Invalid card! " + cards[c].index);
				rowTooMuch = r;
				cardFixed = false;
			}
			else if (cards[c].rowCount[r].length < 5) {
				rowTooLittle = r;
				cardFixed = false;
			}
		}
		
		// Get single number and move to another row. THERE WILL ALWAYS BE EXACTLY 1 NUMBER THAT'S THE ONLY ONE IN THAT 10'S GROUP
		
		if (!cardFixed) {
			for (var m = 0; m < 9; m++) {			
				if (cards[c].numbersCount[m] == 1) {
					for (var cn = 0; cn < cards[c].numbers.length; cn++) {
						// Find number in overflowing row with same modular
						if (m == cards[c].numbers[cn].modular && rowTooMuch == cards[c].numbers[cn].row) {
							// Move
							console.log("Before");
							console.log(cards[c].numbers[cn]);
							
							cards[c].numbers[cn].row = rowTooLittle;
							
							//cards[c].rowCount[rowTooLittle].push(cards[c].numbers[cn]);
							//cards[c].rowCount[rowTooMuch].splice(GetCardIndex(cards[c].numbers[cn].number, cards[c].numbers[cn]), 1);
							
							console.log("After");
							console.log(cards[c].numbers[cn]);
							
							cardFixed = true;
							break;
						}
					}
				}
				
				if (cardFixed) {
					break;
				}
			}
		}
	}*/

	// Set cards to player
	players[p].cards = cards;
		
	for (var t = 0; t < 6; t++) {
		console.log("Card " + t + ": (" + cards[t].numbers.length + ")");
		console.log(cards[t].numbers);
		console.log(cards[t].numbersCount);
		console.log(cards[t].rowCount);
	}
	
	for (var c = 0; c < cards.length; c++) {
		if (!cards[c].rowsAreValid()) {
			logger.error("Card: " + cards[c].index + " has invalid rows!");
		}
	}
	
	if (CardsAreValid(players[p].cards)) {
		logger.info("All cards are valid!");
	}
	else {
		logger.error("CARDS ARE NOT VALID");
		console.log(players[p].cards);
	}
	
	
	return cards;
}

// Functions
function GetRandomNumber(length) {
	return Math.floor(Math.random() * length);
}

function CardsAreValid(cards) {
	for (var i = 0; i < cards.length; i++) {
		if (!cards[i].isValid()) {
			return false;
		}
	}
	return true;
}

function GetCardIndex(number, cardNumbers) {
	for (var i = 0; i < cardNumbers.length; i++) {
		if (cardNumbers[i].number == number) {
			return i;
		}
	}
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