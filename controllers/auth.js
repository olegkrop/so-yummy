const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require("../models/user");
const { HttpError, ctrlWrapper, sendEmail } = require('../helpers/index.js');
const gravatar = require('gravatar');
const path = require('path');
const fs = require('fs/promises');
const { nanoid } = require('nanoid');

const { SECRET_KEY, BASE_URL } = process.env;

const avatarsDir = path.join(__dirname, '../', 'public', 'avatars')

const register = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user) {
        throw HttpError(409, 'Email alreadi in use')
    }

    const hashPassword = await bcrypt.hash(password, 10)
    const avatarURL = gravatar.url(email);
    const verificationToken = nanoid();

    const newUser = await User.create({ ...req.body, password: hashPassword, avatarURL, verificationToken });
    const verifyEmail = {
        to: email, subject: 'Veriti email',
        html: `<a target = "_blank" href = "${BASE_URL}/api/auth/verify/${verificationToken}">Click verify email</a>`
    }

    await sendEmail(verifyEmail);

    res.status(201).json({
        email: newUser.email,
    });
}

const verifyEmail = async (req, res) => {
    const { verificationToken } = req.params;
    const user = await User.findOne({ verificationToken });
    if (!user) {
        throw HttpError(401, 'Email or password invalid')
    }
    await User.findByIdAndUpdate(user._id, { verify: true, verificationToken: '' });

    res.json({
        message: 'Email verity success'
    })
}

const resendVerifyEmail = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        throw HttpError(401, 'Email not found');
    }
    if (user.verify) {
        throw HttpError(401, 'Email already verify');
    }
    const verifyEmail = {
        to: email, subject: 'Veriti email',
        html: `<a target = "_blank" href = "${BASE_URL}/api/auth/verify/${user.verificationToken}">Click verify email</a>`
    }

    await sendEmail(verifyEmail);

    res.json({
        message: 'Verify email end success'
    });
}

const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        throw HttpError(401, 'Email or password invalid')
    }

    if (!user.verify) {
        throw HttpError(401, 'Email not verified');
    }

    const passwordCompare = await bcrypt.compare(password, user.password);

    if (!passwordCompare) {
        throw HttpError(401, 'Email or password invalid')
    }

    const payload = {
        id: user._id,
    }

    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '23h' });
    await User.findByIdAndUpdate(user._id, { token })
    res.json({
        token,
    });
}

const getCurrent = async (req, res) => {
    const { email } = req.user;

    res.json({
        email,
    })
}

const logout = async (req, res) => {
    const { _id } = req.user;
    await User.findByIdAndUpdate(_id, { token: '' });

    res.json({
        message: 'Logout succes'
    });
}

const updateAvatars = async (req, res) => {
    const { _id } = req.user;
    const { path: tempUpload, originalname } = req.file;
    const resultUpload = path.join(avatarsDir, originalname);
    await fs.rename(tempUpload, resultUpload);
    const avatarURL = path.join('avatars', originalname);
    await User.findByIdAndUpdate(_id, { avatarURL });

    res.json({
        avatarURL,
    })
}

module.exports = {
    register: ctrlWrapper(register),
    verifyEmail: ctrlWrapper(verifyEmail),
    resendVerifyEmail: ctrlWrapper(resendVerifyEmail),
    login: ctrlWrapper(login),
    getCurrent: ctrlWrapper(getCurrent),
    logout: ctrlWrapper(logout),
    updateAvatars: ctrlWrapper(updateAvatars),
}