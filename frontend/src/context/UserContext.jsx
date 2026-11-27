import React, { createContext, useState } from 'react';


// eslint-disable-next-line react-refresh/only-export-components -- context and provider live together on purpose
export const UserDataContext = createContext();

const UserContext = ({ children }) => {
    const [user, setUser] = useState(null);

    return (
        <UserDataContext.Provider value={{ user, setUser }}>
            {children}
        </UserDataContext.Provider>
    );
};

export default UserContext;