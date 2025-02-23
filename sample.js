class UserService {
    constructor(database) {
        this.db = database;
        this.cache = new Cache();
    }

    async getUser(id) {
        // Try cache first
        const cached = await this.cache.get(id);
        if (cached) {
            return cached;
        }

        // Get from database
        const user = await this.db.users.findOne(id);
        if (!user) {
            throw new Error('User not found');
        }

        // Update cache
        await this.cache.set(id, user);
        return user;
    }

    async updateUser(id, data) {
        // Validate input
        if (!this.validateUserData(data)) {
            throw new Error('Invalid user data');
        }

        // Update in database
        const updated = await this.db.users.update(id, data);

        // Clear cache
        await this.cache.delete(id);

        return updated;
    }

    validateUserData(data) {
        return data.name && data.email;
    }
} 