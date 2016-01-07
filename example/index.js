var juggler = require('loopback-datasource-juggler');
var async = require('async');
var _ = require('lodash');

var Registry = require('../index');
var registry = new Registry(juggler);

registry.connect(function(err, models) {
    // _.each(models, displayModel);
    async.waterfall([
        function(next) {
            registry.dataSources.db.automigrate(next);
        },
        function(next) {
            models.Author.create({ name: 'Fred' }, function(err, author) {
                console.log('Created Author:', author);
                next(err, author);
            });
        },
        function(author, next) {
            author.books.create({ title: 'New Book' }, function(err, book) {
                console.log('Created Book:', book);
                next(err, book);
            });
        },
        function(book, next) {
            book.author(function(err, author) {
                console.log('Fetched Author:', author);
                next(err, book);
            });
        },
        function(book, next) {
            setTimeout(function() {
                next(err, book);
            }, 1000);
        },
        function(book, next) {
            book.updateAttributes({ title: 'Changed Book' }, function(err, book) {
                console.log('Updated Book:', book);
                next(err);
            });
        }
    ], function() {
        registry.disconnect(function(err) {
            console.log('Disconnected');
        });
    });
});

function displayModel(Model) {
    var definition = Model.definition.toJSON();
    definition.relations = [];
    _.each(Model.relations, function(relation, name) {
        definition.relations.push(relation.toJSON());
    });
    console.log(Model.modelName, JSON.stringify(definition, null, 4));
};
