const morgan = require('morgan');

const logger = morgan('combined', {
  skip: (req, res) => res.statusCode < 400,
});

module.exports = logger;

