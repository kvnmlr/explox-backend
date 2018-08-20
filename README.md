# DEPLOY
# ExploX

## Getting Started

What you will need to get the server running on your local machine.

### Prerequisites

Please install the following software in the stated version or above.
```
Npm: 6.1.0
Node.js: 10.3.0
mongoDB: 3.6 (Community Edition)
```

## Installation

A quick start to get started.
First, open and edit the .env file with your personal credentials. Then, start the program mongod from the mongodb installation directory ([mongoroot]\Server\[version]\bin\mongod.exe).

Open a terminal in the project root directory and install the npm modules:
```
npm install
```
Finally, start the server:
```
npm start
```
Verify project and database setup by running the provided unit tests:
```
npm test
```


## Development:
### Logging
Logging is implemented using log4js. The logger implementation is in app/utils/logger.js. Logs will be printed to the console and a log file called application.log and error.log will be written in /logs.

The logger can be used in the following way:
```javascript
const Log = require('path/to/logger')    
const TAG = "strava";     // should be the module name or whatever makes sense

Log.debug(TAG,'my debug message', data);
Log.error(TAG, 'my error message', data);
Log.log(TAG,'my log message', data);
```
### Tests
Tests are implemented in the folder test using tape. Tape runner is used to run the tests. Tests can be executed via npm test.

 Write tests like this:
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

### Code Style
Please activate ESLint and refer to .eslintrc.