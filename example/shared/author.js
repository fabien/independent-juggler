module.exports = function(Author) {
    console.log('Setup:', Author.modelName);
    
    Author.on('attached', function() {
        console.log('Attached:', Author.modelName);
    });
};