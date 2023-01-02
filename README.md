## Installation

### Node dependencies

Running `npm i` will download and nominally install all the dependencies.
[sqlite3](https://www.npmjs.com/package/sqlite3) installation can be tricky.
Running the unit tests with `npm t` will trigger a failure with sqlite3 if there is a problem.

You can build sqlite3 from source with

```
npm --build-from-source install sqlite3
```

### .env file
Create and edit an `.env` file to load server environment variables.
The `sample.env` file serves as a template.

### Certificates
Copy your CA, certificate, and key pem files the location specified in `.env`.

### Start the server

```
npm run build
DEBUG='rsvp:*' nohup npm run start &
```

## Administration

### Creating an Event

The `npm run build` script compiles a `dist/createEvent.js` node script that
can insert a new event from a JSON file into the database with usage:

```
DEBUG='*' node dist/createEvent data/sample-event.json data/rsvps.sqlite
```

Where the event configuration is JSON in the form of
```
{
   "name": "Extravaganza",
   "venue": 37,
   "description": "# Best Test Event Evuh\nRSVP or ....",
   "dateTimes": [
     { "yyyymmdd": "2018-12-01", "hhmm": "8:39", "duration": "45m" },
     { "yyyymmdd": "2018-12-01", "hhmm": "9:06", "duration": "45m" }
   ]
}
```
You can optionally specify a `dateTime` field in the form of the index of the
possible `dateTimes` to limit users' choices to one.
The JSON configuration is only lightly typechecked.

You may omit the SQLite file option and use the configuration from [`.env`](sample.env), the `RSVPS_SQLITE` environment varibale, or the default
`data/rsvps.sqlite`.

### Deleting an Event

```
DEBUG='*' node dist/deleteEvent <event-id> data/rsvps.sqlite
```

TODO: fuzzy select by event title string

## Updates to V2
- Move to Typescript.
- Intercept (clean up) authentication with `Express.Application.use()`.
- Use Cognito authentication.
- Update SQLite access to supported Promise wrapper.
