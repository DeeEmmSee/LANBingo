var express = require('express');
var socket = require('socket.io');
var mongojs = require('mongojs');
var db = mongojs('localhost:27017/chat', ['account']);

//db.account.insert({username:"b",password:"test2"});
//db.account.insert({username:"b",password:"test2"}, function(err) { });

//App setup
var app = express();
var server = app.listen(4000, function() { 
	console.log('Listening on port 4000');
});

//Static files
app.use(express.static('public'));

// Variables
var rooms = [];
var defaultRoom = "General";

// Socket setup
var io = socket(server);

io.on('connection', function(socket){
	// On connect
	console.log('Connection on', socket.id);
	
	// Events
	socket.on('chat', function(data) {
		if (data.handle) {
			db.logs.insert({username:data.handle, message:data.message});	
		}
		
		io.in(socket.room).emit('chat', data);
	});
	
	socket.on('set_nickname', function(data) {
		db.account.find({username: data.name}, function(err,res) {
			if (res[0]) {
				console.log("Is user");
			}
		});
		
		socket.name = data.name;
		socket.joinDateTime = new Date();
				
		socket.room = defaultRoom;
		socket.join(defaultRoom);
			
		
		AddPlayerToRoom(socket);	
		
		// Welcome message
		socket.emit('chat', { message: socket.name + " has joined " + socket.room});
		
		socket.emit('send_rooms', { rooms: rooms }); // Only client
		socket.broadcast.emit('send_rooms', { rooms: rooms }); // Everyone EXCEPT client
	});
		
	socket.on('join_room', function(data){
		ProcessRoomChange(data);
	});
	
	socket.on('create_room', function(data){
		rooms.push({ name: data.room_name, players: [], playing: false });
		ProcessRoomChange(data);
	});
	
	socket.on('disconnect', function(){
		if (socket.room != null) {
			var endDateTime = new Date();
						
			if (socket.joinDateTime != null) {
				console.log("Disconnected: " + socket.name + " - Up-time: " + ((endDateTime.getTime() - socket.joinDateTime.getTime()) / 1000));
			}
						
			socket.leave(socket.room);
			var roomIndex = GetRoomIndex(socket.room)
			
			if (roomIndex > -1) {
				socket.room = "";
				RemovePlayerFromRoom(socket);
							
				if (rooms[roomIndex].players.length == 0) {
					// Remove room
					rooms.splice(roomIndex, 1);
				}
			}
			socket.to(socket.room).emit('send_rooms', { rooms: rooms }); 	// Current room
			socket.broadcast.emit('send_rooms', { rooms: rooms }); // Everyone EXCEPT client
			socket.broadcast.emit('chat', { message: socket.name + " has left the room" }); // Everyone EXCEPT client
		}
	});
	
	// Inner functions
	function ProcessRoomChange(data) {
		socket.leave(socket.room);
		var roomIndex = GetRoomIndex(socket.room)
		var oldRoom = socket.room;
		
		if (roomIndex > -1) {
			socket.room = "";
			RemovePlayerFromRoom(socket);
			
			if (rooms[roomIndex].players.length == 0) {
				// Remove room
				rooms.splice(roomIndex, 1);
			}
			else {
				socket.to(oldRoom).emit('chat', { message: socket.name + " has left " + oldRoom});
			}
		}
		
		socket.join(data.room_name);
		socket.room = data.room_name;
		AddPlayerToRoom(socket, data.room_name);
		
		io.in(socket.room).emit('chat', { message: socket.name + " has joined " + socket.room});
		socket.broadcast.emit('send_rooms', { rooms: rooms });
		io.in(socket.room).emit('send_rooms', { rooms: rooms });
	}
});

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