var juggler = require('loopback-datasource-juggler');
var async = require('async');
var _ = require('lodash');

var Registry = require('../index');
var registry = new Registry(juggler);

registry.connect(function(err, models) {
    // _.each(models, displayModel);
    registry.dataSources.db.automigrate(function(err) {
        models.Author.create({ name: 'Fred' }, function(err, author) {
            console.log('Author:', author);
            author.books.create({ title: 'New Book' }, function(err, book) {
                console.log('Book:', book);
                book.author(function(err, instance) {
                    console.log('Author:', instance);
                    registry.disconnect(function(err) {
                        console.log('Disconnected');
                    });
                });
                
            });
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
