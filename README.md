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
  * "show dbs" -> should show exploxdb
  * "use exploxdb
  * "show collections" -> should display sessions and users
  * "db.users.find()" -> should display a user called "System"
* This means, the user System has been registered by default
* Try to log in using e-mail "system@explox.de" and password "manager"
