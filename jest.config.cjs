module.exports = {
  transform: {"^.+\\.[tj]sx?$": "babel-jest"},
  moduleNameMapper: {"^(\.{1,2}/.*)\.js$": "$1"},
  testEnvironment: "node"
};