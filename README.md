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
  * "use exploxdb"
  * "show collections" -> should display sessions and users
  * "db.users.find()" -> should display a user called "System"
* This means, the user System has been registered by default
* Try to log in using e-mail "system@explox.de" and password "manager"

## Check Strava Connection
* Set up the API: open .env file in project root and add/edit the following two lines:
** STRAVA_CLIENTID=<21869>
** STRAVA_SECRET=<a9129fe0b77c79b393aff6e21572186a1daf86d4>
** Note that the secret must never become public, i.e. users must not be able to access it!
* Start the server
* Create an account on Strava.com and log in
* Visit https://www.strava.com/oauth/authorize?client_id=21869&response_type=code&redirect_uri=http://localhost:3000&scope=write&state=mystate&approval_prompt=force
* Grant the ExploX app permission to access your data
* The browser should redirect to the ExploX Website (i.e. localhost:3000)
* Check the npm console log, the last log entry should contain the user data

