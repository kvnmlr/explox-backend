# ExploX
Sports Technologies Seminar

## Quick Start
* Run mongod
* _npm install_
* _npm start_
* http://localhost:3000/

## Detailed Setup
### Database Setup
* Install **MongoDB** from https://www.mongodb.com/download-center?jmp=nav#community
* Create a folder /data/db in your computers root dir (e.g. C:// in Windows)
* On Mac, you will have to give write permissions for this directory to MongoDB.
* Run **mongod** ([mongoroot]\Server\3.4\bin\mongod.exe)
* The process should run in a window and not terminate. If it terminates, an error should be logged which you can use to solve the problem.
* Run mongo ([mongoroot]\Server\3.4\bin\mongo.exe)
  
### Project Setup
* Install **Nodejs** https://nodejs.org/en/download/
* cd into project root directory
* Run _npm install_
* Open file .env and fill in strava client ID, strava secret, gmail adress and gmail password (never commit this file).
* Make sure mongod is running (see above)
* Run _npm start_
* Visit http://localhost:3000/
* Website should load

### Check Database
These steps are optional, do them to verify that the DB has been set up correctly and get familiar with the mongo tool:
* Make sure mongod is running (see above)
* Make sure the server has been started (see above)
* Run _npm test_ and _npm start_ at least once, both.
* Run mongo ([mongoroot]\Server\3.4\bin\mongo.exe)
* Execute the following commands within mongo:
  * _show dbs_ -> should show exploxdb_test (used by unit tests) and exploxdb_dev (used in development)
  * _use exploxdb_dev_
  * _show collections_ -> should display sessions, users, routes, geos and roles.
  * _db.users.find()_ -> should display two users, one user called "System" and one user called "user"
  * _db.routes.find()_ -> should display a route called "Saarbruecken Uni Route"
  * _db.geojsons.getIndexes()_ -> should return two indexes, one of which is called "location_2dsphere"
* This means, the user System has been registered by default and a sample Route has been created in the DB
* Try to log in using e-mail "system@explox.de" and password "manager"
* Go to "Profile". The dashboard shows you (part of) the contents of the user and route collections in the db.

### Check Strava Connection
These steps are optional, do them to see how the strava connection works.
* Start the server
* Create an account on Strava.com and log in
* Go to the ExploX login page and click on "Strava Login"
* Grant the ExploX app permission to access your data
* The browser should redirect to the ExploX Website (i.e. localhost:3000)
* You should be logged in and able to access your profile from the menu at the top

### Development Quick Start:
#### Logging
Logging is implemented using log4js. The logger implementation is in app/utils/logger.js. Logs will be printed to the console and a log file called application.log will be written in the project root directory.
It can be used in the following way:
```javascript
const Log = require('path/to/logger')    // actually the path to app/utils/logger.js
const TAG = "strava";                    // should be the module name or whatever makes sense

Log.debug(TAG,'my debug message', data);  // data is optional
Log.error(TAG, 'my error message', data); // data is optional
Log.log(TAG,'my log message', data);      // data is optional
```
#### Tests
Tests are implemented in the folder test. Write tests like this:
```javascript
const test = require('tape');
const {cleanup} = require('./helper');

test('Clean up', cleanup);   // used to clean up the test database
test('this test does x y', t => {
    t.ifError(err);                                 // error test
    t.same(1, 1, 'the two values where not equal')  // equality test
    t.end();  // required at the end of every test
});
```

