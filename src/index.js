var restify = require('restify');
var request = require('request');
var errors = require('restify-errors');
var _ = require('underscore-node');

var server = restify.createServer();
server.use(restify.plugins.queryParser());
server.get('/cities', citiesAround);
server.get('/cities/:id', cityDetails);
server.get('/cities/:id/weather', cityWeather);

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});

/**
 * Create a request with url parameters, optional query and success callback
 */
function createRequest(urlParams, query, res, success) {	
   	if(query.lat && query.lng)
	{       
		var latitude = parseFloat(query.lat);
		var longitude = parseFloat(query.lng);
		var latLng = {latitude: latitude, longitude: longitude};
	}
	request.get({
		url: "http://api.openweathermap.org/data/2.5/" + urlParams + '&APPID=7f04ad69f319e3cf58777288f8e0cd0e'
	},
	function (error, response, body) {
		callback(error, response, body, res, success, latLng);
	});
}

/**
 * Callback function to be executed after each creation of a request (this can be successCitiesAround,
 * successCityDetails or successCityWeather)
 */ 
function callback(error, response, body, res, success, latLng) {
	var result = null;		
	if (response != null && body != null && response.statusCode == "200")
	{
		var body = JSON.parse(body);
		if (success != null && body.cod == "200")
		{
			result = success(res, body);
			// if latitude and longitude are defined, search and return the cities within 10km
			if (latLng != null) {	
				var latitude = latLng.latitude;
				var longitude = latLng.longitude;
				result = searchWithin10km(result, latitude, longitude);
			}
		}
	}	
	res.setHeader('content-type', 'application/json');
	if (result != null)	{
		res.send(result);
	}
	else {
		res.send(new errors.NotFoundError("not found"));
	}
	return result;
}

/**
 * Request: GET /cities?lan=x&lng=y
 */
function citiesAround(req, res, next) {
	var latitude = parseFloat(req.query.lat);
	var longitude = parseFloat(req.query.lng);
	var params = { latitude: latitude, longitude: longitude}
	if(isNumber(longitude) && isNumber(latitude)) {	
		// fetch the 30 nearest cities 
		var urlParams = 'find?lat=' + latitude + '&lon=' + longitude + '&cnt=30';		
		createRequest(urlParams, req.query, res, successCitiesAround);
	}
	else {
		return next(new errors.BadRequestError("lat/lng required"));
	}
	next();
}
/**
 * Callback function to return cities around
 */
function successCitiesAround(res, cities) {
	var list = null;	
	if (cities != null)
	{
		list = _.map(cities.list, function(key) {			
			return _.pick(key, 'id', 'name', 'coord'); 
		});
	}
	return list;
}

/**
 * Request: GET /cities/{id}
 */	
function cityDetails(req, res, next) {
	var id = parseFloat(req.params.id);
	if (isNumber(id)) {
		var urlParams = 'weather?id=' + id;	
		createRequest(urlParams, req.query, res, successCityDetails);
	}
	else {
		return next(new errors.NotFoundError("not found"));
	}	
}

/**
 * Callback function to return city details
 */
function successCityDetails(res, city) {
	if (city != null)
	{
		return { 
			id: city.id,
			name: city.name,
			lat: city.coord.lat,
			lng: city.coord.lon			
		}
	}
}

/**
 * Request: GET /cities/{id}/weather
 */
function cityWeather(req, res, next) {
	var id = parseFloat(req.params.id);
	if (isNumber(id)) {
		var urlParams = 'weather?id=' + id;	
		createRequest(urlParams, req.query, res, successCityWeather);
	}
	else {
		return next(new errors.NotFoundError("not found"));
	}	
}

/**
 * Callback function to return city weather
 */
function successCityWeather(res, city) {
	if(city != null)
	{
		return { 
			type: city.weather[0].main,
			type_description: city.weather[0].description,
			sunrise: new Date(city.sys.sunrise*1000), // UTC is in seconds, utc*1000 = miliseconds
			sunset: new Date(city.sys.sunset*1000), // UTC is in seconds, utc*1000 = miliseconds
			temp: kelvinToCelsius(city.main.temp),
			temp_min: kelvinToCelsius(city.main.temp_min),
			temp_max: kelvinToCelsius(city.main.temp_max),
			pressure: city.main.pressure,
			humidity: city.main.humidity,
			clouds_percent: city.clouds.all,
			wind_speed: city.wind.speed
		}
	}
}

/**
 * Transform Kelvin to Celsius and round to at most 2 decimal places
 */
function kelvinToCelsius(temp) {
	return Math.round((temp - 273.15) * 100) / 100;
}

/**
 * Determine if variable is a number
 */ 
function isNumber(number) {
  return !isNaN(parseFloat(number)) && isFinite(number);
}

/**
 * Filter the result cities that are within 10 km of the latitude and longitude
 */
function searchWithin10km(cities, latitude, longitude) {
	var result = [];
	cities.forEach( function(city)
	{		
		var lon = city.coord.lon;
		var lat = city.coord.lat;
		var dist = latLngToKm(latitude, longitude, lat, lon);
		dist = Math.round(dist * 1000) / 1000; // round to 3 decimal places
		// add city only if < 10km
		if (dist <= 10) {
			console.log("Distance to " + city.name +  " = " + dist + " km");
			delete city.coord;
			result.push(city);
		}			
	});
	return result;
}	

/**
 * Calculate the distance between two points based on their latitude and longitude using the Haversine formula
 * https://en.wikipedia.org/wiki/Haversine_formula
 */	
function latLngToKm(lat1, lng1, lat2, lng2) {
	var radiusEarth = 6371; // in km
	var distLat = degToRad(lat2 - lat1); 
	var distLng = degToRad(lng2 - lng1); 
	var a = Math.sin(distLat/2) * Math.sin(distLat/2) + Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * 
		Math.sin(distLng/2) * Math.sin(distLng/2); 
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
	return radiusEarth * c;
}

/**
 * Transfrom degree to radian
 */
function degToRad(deg) {
  return deg * (Math.PI/180)
}
