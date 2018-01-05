var app = angular.module('app', []);
app.controller('HomeCtrl', ['$scope', '$http', '$timeout', function($scope, $http, $timeout) {	
	// Variables
	$scope.messages = [];
	$scope.rooms = [];
	$scope.current_room = "General";
	$scope.nickname = '';
	$scope.cards = [];
	$scope.users = [];
	
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
	
	$scope.NewCard = function() {
		socket.emit('generate_numbers');
	}
	
	function SetUpSocket() {
		socket.on('connect', function(){
			//On connect
		});
		
		// Listen events
		socket.on('connect_failed', function() {
		   alert("Sorry, there seems to be an issue with the connection. Please try again later.");
		});
		
		socket.on('connect_success', function(data) {
		   $scope.$apply($scope.nickname = data.name);
		});
		
		socket.on('update_users', function(data) {
		   $scope.$apply($scope.users = data.users);
		});

		socket.on('error', function(data) {
			//Disconnect completely
			socket.disconnect();
			$scope.$apply($scope.nickname = '');
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
			$scope.$apply($scope.cards = data.cards);
			
			console.log(data.cards);
		});
		
		socket.on('disconnect', function() {
			$scope.$apply($scope.nickname = '');
			$scope.$apply($scope.messages = []);
		});
	}
}]);

app.directive("bingocard", ['$compile', function($compile) {
	return {
		restrict: 'E',
		scope: {
			numbers: '=',
		},
		link: function (scope, element) { 
			// When 'numbers' variable changes
			scope.$watch("numbers", function() {
				element.empty();
				
				var template = "";
			
				for (var r = 0; r < 3; r++) {
					template += "<div class='row'>";
					for (var c = 0; c < 9; c++) {
						template += "<div class='cardCell col-sm-1'>";
						var numberArray = scope.numbers.filter(function(n) { return n.row == r && n.modular == c; });
						if (numberArray.length > 0) {
							number = numberArray[0];
							console.log(number);
							template += number.number;
						}
						template += "</div>";
					}	
					template += "</div>";
				}
				
				template += "<br />";
							
				var	compiled = $compile(template)(scope);
				element.append(compiled);
			});			
		}
	}
}]);