# ExploX
Sports Technologies Seminar

## Database Setup
* Install MongoDB from https://www.mongodb.com/download-center?jmp=nav#community
* Create a folder /data/db in your computers root dir (e.g. C:// in Windows)
* On Mac, you will have to give write permissions for this directory to MongoDB.
* Run mongod ([mongoroot]\Server\3.4\bin\mongod.exe)
* The process should run in a window and not terminate. If it terminates, an error should be logged which you can use to solve the problem.


## Project Setup
* Install Nodejs https://nodejs.org/en/download/
* cd into project root directory
* Run "npm install"
* Make sure mongod is running (see above)
* Run "npm start"
* Visit http://localhost:3000/
* Website should load
* (Optional) Run "npm test"
  * This will run the unit tests. Ideally all tests will pass.

## Check Database
These steps are optional, do them to verify that the DB has been set up correctly and get familiar with the mongo tool:
* Make sure mongod is running (see above)
* Make sure the server has been started (see above)
* Run mongo ([mongoroot]\Server\3.4\bin\mongo.exe)
* Execute the following commands within mongo:
  * "show dbs" -> should show exploxdb_test (used by unit tests) and exploxdb_dev (used in development)
  * "use exploxdb_dev"
  * "show collections" -> should display sessions, users, routes, geos and roles.
  * "db.users.find()" -> should display two users, one user called "System" and one user called "user"
  * "db.routes.find()" -> should display a route called "Saarbruecken Uni Route"
  * Try out the same for the remaining collections geos and roles.
  * "db.roles.find({name: admin})" will only give you the roles where the name attribute is "admin".
* This means, the user System has been registered by default and a sample Route has been created in the DB
* Try to log in using e-mail "system@explox.de" and password "manager"
* Go to "Profile". The dashboard shows you (part of) the contents of the user and route collections in the db.

## Check Strava Connection
These steps are optional, do them to see how the strava connection works.
* Start the server
* Create an account on Strava.com and log in
* Go to the ExploX login page and click on "Strava Login"
* Grant the ExploX app permission to access your data
* The browser should redirect to the ExploX Website (i.e. localhost:3000)
  * In the current version, there is an error. Restart the server and log in again and it should work.
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

