# Independent Juggler

An opinionated helper for using loopback-datasource-juggler independently from
Loopback. It's a lightweight implementation of some of the things
loopback-boot does for Loopback, but much more simplified.

Config files are loaded according to the current `NODE_ENV`, and merged with
the base config:

```
config/datasources.production.json  
config/datasources.json
```

## Usage

```
var juggler = require('loopback-datasource-juggler');
var Registry = require('independent-juggler');

var registry = new Registry(juggler);

registry.connect(function(err, models) {
    var db = registry.dataSources['db'];
    var Book = registry.models['Book'];
    
    db.automigrate(function(err) {
        Book.create({ title: 'New Book' }, function(err, book) {
            console.log('Book:', book);
        });
    });
});
```