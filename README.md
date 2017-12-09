# ExploX
Sports Technologies Seminar

## Database Setup
* Install MongoDB from https://www.mongodb.com/download-center?jmp=nav#community
* Run mongod ([mongoroot]\Server\3.4\bin\mongod.exe)

## Project Setup
* Install Nodejs https://nodejs.org/en/download/
* cd into project root directory
* Run "npm install"
* Make sure mongod is running (see above)
* Run "npm start"
* Visit http://localhost:3000/
* Website should load

## Check Database
* Make sure mongod is running (see above)
* Make sure the server has been started (see above)
* Run mongo ([mongoroot]\Server\3.4\bin\mongo.exe)
* Execute the following commands within mongo:
  * "show dbs" -> should show exploxdb_test (used by unit tests) and exploxdb_dev (used in development)
  * "use exploxdb_dev"
  * "show collections" -> should display sessions and users
  * "db.users.find()" -> should display a user called "System"
  * "db.articles.find()" -> should display a article called "Test Route"
* This means, the user System has been registered by default and a sample Route has been created in the DB
* Try to log in using e-mail "system@explox.de" and password "manager"

## Check Strava Connection
* Start the server
* Create an account on Strava.com and log in
* Go to the ExploX login page and click on "Strava Login"
* Grant the ExploX app permission to access your data
* The browser should redirect to the ExploX Website (i.e. localhost:3000)
* You should be logged in and able to access your profile from the menu at the top
* Check the npm console log, the last log entry should contain the user data queried from the API.

## Development Quick Start:
* Strava API:
  * Implementation goes into "app\controllers\strava.js"
  * Routes can be set up in "config\routes.js"
  * Tests go into "test\test-strava-api.js"
* Views:
  * Routes can be set up in "config\routes.js"
  * Views are in "app\views"
* Database:
  * Models are defined in "app\models"

