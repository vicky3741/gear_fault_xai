"""
CNN-BiLSTM (with self-attention) model — alternative to the plain 1D-CNN.

Idea:
  Conv1D blocks  -> local frequency-pattern features
  BiLSTM         -> reads the feature sequence both directions (context)
  Self-Attention -> weights the most informative positions
  Dense + softmax-> 5-class severity

Input is the SAME as the main pipeline: FFT magnitude (bins, channels), e.g. (257, 3),
so it plugs into the same preprocessing / leakage-safe split / voting.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import (Input, Conv1D, BatchNormalization, MaxPooling1D,
                                      Bidirectional, LSTM, Dense, Dropout,
                                      GlobalAveragePooling1D, Attention)
from tensorflow.keras.regularizers import l2


def build_model(input_len=None, n_channels=3, n_classes=5, lr=None):
    input_len = input_len or C.WINDOW
    lr = lr or C.LR
    wd = 1e-3
    inp = Input(shape=(input_len, n_channels))

    # ---- CNN feature extractor ----
    x = Conv1D(16, 16, padding="same", activation="relu", kernel_regularizer=l2(wd))(inp)
    x = BatchNormalization()(x); x = MaxPooling1D(2)(x)
    x = Conv1D(32, 8, padding="same", activation="relu", kernel_regularizer=l2(wd))(x)
    x = BatchNormalization()(x); x = MaxPooling1D(2)(x)
    x = Conv1D(64, 4, padding="same", activation="relu", kernel_regularizer=l2(wd))(x)
    x = BatchNormalization()(x); x = MaxPooling1D(2)(x)      # -> (bins/8, 64)

    # ---- BiLSTM reads the feature sequence both directions ----
    seq = Bidirectional(LSTM(32, return_sequences=True))(x)  # (steps, 64)

    # ---- self-attention (query=key=value=seq) ----
    att = Attention()([seq, seq])                            # (steps, 64)

    # ---- pool + classify ----
    g = GlobalAveragePooling1D(name="feat")(att)             # (64,)  XAI/t-SNE hook
    g = Dropout(0.5)(g)
    out = Dense(n_classes, activation="softmax", name="out")(g)

    model = Model(inp, out)
    model.compile(optimizer=tf.keras.optimizers.Adam(lr),
                  loss="categorical_crossentropy", metrics=["accuracy"])
    return model


if __name__ == "__main__":
    build_model(input_len=257, n_channels=3).summary()
