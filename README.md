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

## Updates to V2
- Move to Typescript.
- Intercept (clean up) authentication with `Express.Application.use()`.
- Use Cognito authentication.
- Update SQLite access to supported Promise wrapper.
