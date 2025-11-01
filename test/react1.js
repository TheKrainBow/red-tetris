const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')
const { Tetris, Board } = require('../src/client/components/test')

chai.should()

describe('Fake react test', function () {
  it('works', function () {
    const renderer = new ShallowRenderer()
    renderer.render(React.createElement(Tetris))
    const output = renderer.getRenderOutput()
    output.type.should.equal(Board)
  })
})
