import './App.css';

import React, {useState, useEffect} from 'react';
import {MemoryRouter as Router, Route, NavLink} from 'react-router-dom';
import {Menu, Spin} from 'antd';

import OrderHistory from 'components/OrderHistory';
import OpenOrders from 'components/OpenOrders';
import Scalp from 'components/ScalpComponent';
import showMessage from 'utils/showMessage';

const App = (props) => {
  const [selectedKey, setSelectedKey] = useState(['scalp']);
  const [spining, setSpining] = useState(false);

  // useEffect(() => {
  //   const func = async () => {
  //     setSpining(true);
  //     try {
  //       window.db = await mongoClient(dbName);
  //       window.binance = Binance({
  //         apiKey: 'Q5LtPfSr9JKs09slnUk6XwGBSnMMotcd1KAhlAjil2VEbggIgqm1iw478Zx5x04a',
  //         apiSecret: 'NORxIW5SEv7YJOohqTxSI0v1NMNyuT4lcz4T0pvkCRuYhLYxPQsCn7Fey3SZsyQR',
  //         logToDb: window.db
  //       })
  //     } catch (e) {
  //       showMessage('error', "Something wrong, try to reload app");
  //       console.error(e);
  //     }
  //     setSpining(false);
  //   };
  //   func();
  // }, []);

  return (
    <Spin className="App" spinning={spining} tip="Loading..." size="large">
      <Router
        initialEntries={['/scalp']}
        initialIndex={1}
      >
        <Menu
          theme="light"
          mode="horizontal"
          style={{lineHeight: '32px'}}
          selectedKeys={selectedKey}
          onClick={(e) => setSelectedKey([e.key])}
        >
          <Menu.Item key="scalp">
            <NavLink to="/scalp">
              Scalp
            </NavLink>
          </Menu.Item>
          <Menu.Item key="orderHistory">
            <NavLink to='/order-history'>
              Order history
            </NavLink>
          </Menu.Item>
          <Menu.Item key="openOrders">
            <NavLink to='/open-orders'>
              Open orders
            </NavLink>
          </Menu.Item>
        </Menu>
        <Route path="/scalp" render={(props) => <Scalp {...props}/>}/>
        <Route path="/order-history" render={(props) => <OrderHistory {...props}/>}/>
        <Route path="/open-orders" render={(props) => <OpenOrders {...props}/>}/>
      </Router>
    </Spin>
  );
};

export default App;
