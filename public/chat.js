var app = angular.module('app', []);
app.controller('HomeCtrl', ['$scope', '$http', '$timeout', function($scope, $http, $timeout) {	
	// Variables
	$scope.messages = [];
	$scope.rooms = [];
	$scope.current_room = "General";
	$scope.nickname = '';
	$scope.cards = [];
	
	var socket;
	
	// Events
	$scope.Connect = function(nickname) {
		// Make connection
		socket = io.connect('http://localhost:4000');
		SetUpSocket();
		socket.emit('set_nickname', { name: nickname, admin: true });
	};
	
	$scope.SendMessage = function() {
		var message = document.getElementById('message');
		if (message.value != '') {
			socket.emit('chat', { message: message.value, handle: $scope.nickname });
		}
		
		message.value = '';
	};
		
	$scope.EnterPressed = function(e) {
		if (e.keyCode == 13) {
			$scope.SendMessage();
		}
	}
	
	function SetUpSocket() {
		socket.on('connect', function(){
			//On connect
		});
		
		// Listen events
		socket.on('connect_failed', function() {
		   document.write("Sorry, there seems to be an issue with the connection!");
		});
		
		socket.on('connect_success', function(data) {
		   $scope.nickname = data.name;
		});

		socket.on('error', function(data) {
			//Disconnect completely
			socket.disconnect();
			$scope.apply($scope.nickname = '');
		});
		
		socket.on('error_msg', function(data) {
			console.log("ERROR: " + data.error);
			alert("ERROR: " + data.error);
		});
					
		socket.on('chat', function(data) {
			$scope.$apply($scope.messages.push(data));
			document.getElementById("chat-window").scrollTop = document.getElementById("chat-window").scrollHeight;
		});
		
		socket.on('get_numbers', function(data) {
			$scope.apply($scope.cards = data.cards);
		});
		
		socket.on('disconnect', function() {
			$scope.apply($scope.nickname = '');
		});
	}
}]);