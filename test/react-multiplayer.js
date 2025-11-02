const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')

const Multiplayer = require('../frontend/src/pages/Multiplayer').default
const Button = require('../frontend/src/components/Button.jsx').default

chai.should()

describe('Multiplayer page', function () {
  it('renders two servers and disabled Join initially', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(Multiplayer))
    const out = r.getRenderOutput()
    out.props.className.should.equal('mp-root')

    // find list wrapper and list
    const content = out.props.children.find(c => c && c.props && c.props.className === 'mp-content')
    const listWrap = content.props.children.find(c => c && c.props && c.props.className === 'mp-list-wrap')
    const list = listWrap.props.children

    const rows = list.props.children.filter(Boolean)
    rows.length.should.be.at.least(2)

    // footer with three Buttons, first is disabled Join Server
    const footer = content.props.children.find(c => c && c.props && c.props.className === 'mp-footer')
    const [joinBtn, createBtn, cancelBtn] = footer.props.children
    joinBtn.type.should.equal(Button)
    joinBtn.props.disabled.should.equal(true)
    createBtn.type.should.equal(Button)
    cancelBtn.type.should.equal(Button)
  })
})

