var app = angular.module('app', []);
app.controller('HomeCtrl', ['$scope', '$http', '$timeout', function($scope, $http, $timeout) {	
	// Variables
	$scope.messages = [];
	$scope.rooms = [];
	$scope.current_room = "General";
	$scope.nickname = '';
	
	// Make connection
	var socket = io.connect('http://localhost:4000');
	
	socket.on('connect', function(){
		//On connect
		
	});
	
	// Listen events
	socket.on('connect_failed', function() {
	   document.write("Sorry, there seems to be an issue with the connection!");
	});

	socket.on('error', function(data) {
		console.log("ERROR: " + data.error);
	});
	
	socket.on('error_msg', function(data) {
		console.log("ERROR: " + data.error);
	});
	
	socket.on('send_rooms', function(data) {
		$scope.$apply($scope.rooms = data.rooms);
	});
			
	socket.on('chat', function(data) {
		$scope.$apply($scope.messages.push(data));
		document.getElementById("chat-window").scrollTop = document.getElementById("chat-window").scrollHeight;
	});
	
	socket.on('user_join_leave', function(data) {
		$scope.$apply($scope.messages.push(data));
	});
	
	socket.on('disconnect', function() {
		$scope.apply($scope.nickname = '');
	});
	
	
	// Events
	$scope.Connect = function(nickname) {
		$scope.nickname = nickname;
		socket.emit('set_nickname', { name: nickname, admin: true });
	};
	
	$scope.SendMessage = function() {
		var message = document.getElementById('message');
		if (message.value != '') {
			socket.emit('chat', { message: message.value, handle: $scope.nickname });
		}
		
		message.value = '';
	};
	
	$scope.CreateRoom = function(room_name) {
		$scope.messages = []
		$scope.current_room = room_name;
		socket.emit('create_room', { room_name: room_name });
	};
	
	$scope.JoinRoom = function(room_name) {
		$scope.messages = []
		$scope.current_room = room_name;
		socket.emit('join_room', { room_name: room_name });
	};
	
	$scope.EnterPressed = function(e) {
		if (e.keyCode == 13) {
			$scope.SendMessage();
		}
	}
}]);