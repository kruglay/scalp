import './scalpComponent.css';

import React, {Component, Fragment} from 'react';
import {observer} from 'mobx-react';
import {Form, Button, Input, InputNumber, Divider} from 'antd';

import Scalp from 'utils/Scalp';
import showMessage from 'utils/showMessage';
import InputRate from 'InputRate';

const {Item: FormItem, create} = Form;

@observer
class ScalpComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      disabledTradeSettings: false,
      showInfo: false,
    };
    this.scalp = {state: {}};
  }

  handleSubmit = (e) => {
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (!err) {
        const {
          symbol,
          quantity,
          openRate,
          closeAsksRate,
          closeBidsRate,
          reopenAsksRate,
          minQuantityRate
        } = values;
        this.scalp = new Scalp({
          symbol,
          quantity,
          openRate,
          closeAsksRate,
          reopenAsksRate,
          closeBidsRate,
          minQuantityRate
        }, window.db, window.binance);
        this.setState({showInfo: true});
        try {
          this.setState({loading: true});
          this.setState({
            disabledTradeSettings: true,
          });
          this.scalp.start()
            .then(res => {
              this.setState({disabledTradeSettings: false})
            })
            .catch(err => showMessage('error', err.message));
          console.log('after scalp');

        } catch (e) {
          showMessage('error', e.message);
          console.error(e);
        }
        this.setState({loading: false});
      }
    });

  };

  setRate = (name) => {
    const {form: {validateFields}} = this.props;
    const scalp = this.scalp;
    return () => {
      let set = false;
      validateFields([name], (err, values) => {
        if (!err) {
          set = true;
          scalp[name] = Number(values[name]);
        }
      });
      return set;
    };
  };

  render() {
    const test = !!window.process.env.TEST;
    const {
      loading,
      disabledTradeSettings,
      showInfo
    } = this.state;
    const {form: {getFieldDecorator}} = this.props;
    showInfo && console.log('this.scalp.state.step', this.scalp.state.step);
    return (
      <div className="scalp">
        <Form onSubmit={this.handleSubmit}>
          <div className="trade-pair">
            <Form.Item label="Trade pair">
              {getFieldDecorator('symbol', {
                initialValue: test ? 'TRXBTC' : undefined,
                rules: [
                  {
                    required: true,
                    message: 'Please input trade pair'
                  }
                ],
              })(
                <Input disabled={disabledTradeSettings}/>,
              )}
            </Form.Item>
            <Form.Item label="Quantity" className="trade-pair-quantity">
              {getFieldDecorator('quantity', {
                initialValue: test ? '500' : undefined,
                rules: [
                  {
                    required: true,
                    message: 'Please input quantity'
                  }
                ],
              })(
                <InputNumber disabled={disabledTradeSettings} min={0.1} style={{width: '100%'}}/>,
              )}
            </Form.Item>
          </div>
          <Divider orientation="left">Rates</Divider>
          <div className="trades-rates">
            <div className="trade-rates-left">
              <Form.Item label="Open rate">
                {getFieldDecorator('openRate', {
                  initialValue: 4,
                  rules: [
                    {
                      required: true,
                      message: 'Please input rate'
                    }
                  ],
                })(
                  <InputRate
                    min={0.1}
                    precision={2}
                    setRate={this.setRate('openRate')}
                    style={{width: '100%'}}
                    rateValue={0}
                  />
                )}
              </Form.Item>
              <Form.Item label="Close asks rate">
                {getFieldDecorator('closeAsksRate', {
                  initialValue: 0.5,
                  rules: [
                    {
                      required: true,
                      message: 'Please input rate'
                    }
                  ],
                })(
                  <InputRate
                    min={0.1}
                    precision={2}
                    setRate={this.setRate('closeAsksRate')}
                    style={{width: '100%'}}
                    rateValue={0}
                  />
                )}
              </Form.Item>
              <Form.Item label="Close bids rate">
                {getFieldDecorator('closeBidsRate', {
                  initialValue: 1.5,
                  rules: [
                    {
                      required: true,
                      message: 'Please input rate'
                    }
                  ],
                })(
                  <InputRate
                    min={0.1}
                    precision={2}
                    setRate={this.setRate('closeBidsRate')}
                    style={{width: '100%'}}
                    rateValue={0}
                  />
                )}
              </Form.Item>
            </div>
            <div className="trades-rates-center">
              <Form.Item label="Reopen asks rate">
                {getFieldDecorator('reopenAsksRate', {
                  initialValue: 0.15,
                  rules: [
                    {
                      required: true,
                      message: 'Please input rate'
                    }
                  ],
                })(
                  <InputRate
                    min={0.1}
                    precision={2}
                    setRate={this.setRate('reopenAsksRate')}
                    style={{width: '100%'}}
                    rateValue={0}
                  />
                )}
              </Form.Item>
              <Form.Item label="Min quantity rate">
                {getFieldDecorator('minQuantityRate', {
                  initialValue: 2,
                  rules: [
                    {
                      required: true,
                      message: 'Please input rate'
                    }
                  ],
                })(
                  <InputRate
                    min={0.1}
                    precision={2}
                    setRate={this.setRate('minQuantityRate')}
                    style={{width: '100%'}}
                    rateValue={0}
                  />
                )}
              </Form.Item>
            </div>
            <div className="trades-rates-actions">
              <Button
                type="primary"
                style={{width: '8rem'}}
              >
                Get mean
              </Button>
              <Button
                htmlType="submit"
                type="primary"
                loading={['START', 'INIT'].includes(this.scalp.state.step)}
                style={{width: '8rem'}}
                disabled={this.scalp.state.step && this.scalp.state.step !== 'STOP'}
              >
                Start
              </Button>
              <Button
                onClick={() => this.scalp.stopScalping()}
                style={{width: '8rem'}}
                disabled={this.scalp.state.step === 'STOP'}
              >
                Stop
              </Button>
            </div>
          </div>



        </Form>
        <Fragment>
          <div className="scalp-step">{this.scalp.state.step}</div>
          <div className="scalp-mean-sell">{this.scalp.meanSellQty}</div>
        </Fragment>
      </div>
    );
  }
};

export default create()(ScalpComponent);
