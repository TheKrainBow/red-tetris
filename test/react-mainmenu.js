const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')

// Import the page
const MainMenu = require('../frontend/src/pages/MainMenu').default

chai.should()

describe('MainMenu page', function () {
  it('renders structure and 3 primary buttons', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(MainMenu))
    const out = r.getRenderOutput()
    out.props.className.should.equal('mm-root')

    // Find mm-content
    const content = out.props.children.find(c => c && c.props && c.props.className && String(c.props.className).includes('mm-content'))
    chai.expect(content).to.exist

    // Inside content, find primary group and ensure 3 buttons exist
    const primary = content.props.children.find(c => c && c.props && c.props.className === 'mm-primary')
    chai.expect(primary).to.exist
    const btns = primary.props.children.filter(Boolean)
    btns.length.should.equal(3)
  })
})

