import React, {Component, Fragment} from 'react';
import {observer} from 'mobx-react';
import {Form, Button, Input, InputNumber} from 'antd';

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
  }

  handleSubmit = (e) => {
    e.preventDefault();
    this.props.form.validateFields(async (err, values) => {
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
          await this.scalp.start();
          this.setState({
            disabledTradeSettings: true,
          })
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
        if(!err) {
          set = true;
          scalp[name] = Number(values[name]);
        }
      });
      return set;
    }
  };

  render() {
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
          <Form.Item label="Trade pair">
            {getFieldDecorator('symbol', {
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
          <Form.Item label="Quantity">
            {getFieldDecorator('quantity', {
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
              <InputRate min={0.1} precision={2} setRate={this.setRate('openRate')} style={{width: '100%'}}/>
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
              <InputRate min={0.1} precision={2} setRate={this.setRate('closeAsksRate')} style={{width: '100%'}}/>
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
              <InputRate min={0.1} precision={2} setRate={this.setRate('closeBidsRate')} style={{width: '100%'}}/>
            )}
          </Form.Item>
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
              <InputRate min={0.1} precision={2} setRate={this.setRate('reopenAsksRate')} style={{width: '100%'}}/>
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
              <InputRate min={0.1} precision={2} setRate={this.setRate('minQuantityRate')} style={{width: '100%'}}/>
            )}
          </Form.Item>
          <Button htmlType="submit" type="primary" loading={loading}>Start</Button>
        </Form>
        {
          showInfo && <Fragment>
            <div className="scalp-step">{this.scalp.state.step}</div>
            <div className="scalp-mean-sell">{this.scalp.meanSellQty}</div>
          </Fragment>
        }
      </div>
    );
  }
};

export default create()(ScalpComponent);
