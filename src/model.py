"""
1D-CNN following the reference report architecture, adapted to input length.
Conv 16(k16)/32(k8)/64(k4) + BN + MaxPool2, Flatten, Dense64, Dropout0.4, softmax.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import (Conv1D, MaxPooling1D, Flatten, Dense,
                                      Dropout, BatchNormalization, Input,
                                      GlobalAveragePooling1D)
from tensorflow.keras.regularizers import l2


def build_model(input_len=None, n_channels=3, n_classes=5, lr=None):
    """
    Reference-style 1D-CNN, regularised for a small dataset:
    Flatten replaced by GlobalAveragePooling1D (removes the 262k-param dense
    layer that memorised the data) + L2 weight decay. Same 3 conv blocks.
    """
    input_len = input_len or C.WINDOW
    lr = lr or C.LR
    wd = 1e-3
    model = Sequential([
        Input(shape=(input_len, n_channels)),
        Conv1D(16, 16, padding="same", activation="relu", kernel_regularizer=l2(wd)),
        BatchNormalization(), MaxPooling1D(2),
        Conv1D(32, 8, padding="same", activation="relu", kernel_regularizer=l2(wd)),
        BatchNormalization(), MaxPooling1D(2),
        Conv1D(64, 4, padding="same", activation="relu", kernel_regularizer=l2(wd)),
        BatchNormalization(), MaxPooling1D(2),
        GlobalAveragePooling1D(),
        Dense(32, activation="relu", name="feat", kernel_regularizer=l2(wd)),
        Dropout(0.5),
        Dense(n_classes, activation="softmax", name="out"),
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(lr),
                  loss="categorical_crossentropy", metrics=["accuracy"])
    return model


if __name__ == "__main__":
    build_model().summary()
