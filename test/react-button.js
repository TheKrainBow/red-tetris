const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')
const Button = require('../frontend/src/components/Button.jsx').default

chai.should()

describe('UI Button', function () {
  it('renders children and merges classes', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(Button, { className: 'extra' }, 'Click'))
    const out = r.getRenderOutput()
    out.type.should.equal('button')
    out.props.className.should.match(/ui-btn/)
    out.props.className.should.match(/extra/)
    out.props.children.should.equal('Click')
  })

  it('applies small size and disabled state', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(Button, { size: 'small', disabled: true }, 'x'))
    const out = r.getRenderOutput()
    out.props.className.should.match(/ui-btn-small/)
    out.props.className.should.match(/ui-btn-disabled/)
    out.props.disabled.should.equal(true)
    // onClick is stripped when disabled
    chai.expect(out.props.onClick).to.equal(undefined)
  })
})

